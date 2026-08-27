import { config } from "./config.js";
import { createLocalSigner } from "./signer.js";
import { findBestOpportunity } from "./opportunity.js";
import { executeOpportunity } from "./execute.js";
import { publicClient } from "./market.js";

/** How often to scan for opportunities. Arbitrum produces blocks roughly
 *  every 250ms, but polling that fast would spam the RPC for little benefit
 *  given our scan does multiple quote calls per cycle; 5s is a reasonable
 *  starting point, easy to tune later. */
const POLL_INTERVAL_MS = 5_000;

/** Conservative gas estimate for a full requestFlashLoan round trip
 *  (flash loan callback + two DEX swaps + repayment). Derived from observed
 *  gas usage: ArbixExecutor.executeArbitrage averaged ~230k gas standalone
 *  (see forge --gas-report), plus flash loan overhead and two external swap
 *  calls each costing 100k-140k gas on the real adapters. 600k is a
 *  deliberately generous ceiling so we don't chase trades that would
 *  actually lose money to gas once real execution overhead is included. */
const ESTIMATED_GAS_UNITS = 600_000n;

/** Require net profit to exceed estimated gas cost by this multiple before
 *  executing — pure margin of safety against gas price fluctuation between
 *  detection and confirmation, and against our gas estimate being off. */
const PROFIT_TO_GAS_SAFETY_MULTIPLE = 2n;

/** All our on-chain addresses (Aave, SushiSwap, Camelot, Arbix contracts)
 *  are Arbitrum One mainnet addresses — see config.ts. The bot must only
 *  ever run against a node claiming to BE chain 42161, whether that's real
 *  mainnet or a local fork of it. This guards against ever accidentally
 *  pointing RPC_URL at a different network while these addresses are still
 *  configured, which would either fail confusingly or, worse, silently
 *  interact with unrelated contracts that happen to exist at those
 *  addresses on the wrong chain. */
const EXPECTED_CHAIN_ID = 42161;

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function assertCorrectChain() {
  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Chain ID mismatch: expected ${EXPECTED_CHAIN_ID} (Arbitrum One or a fork of it), ` +
        `but RPC ${config.rpcUrl} reports chain ID ${actualChainId}. Refusing to start — ` +
        `all configured contract addresses assume Arbitrum One.`
    );
  }
  log(`Chain ID verified: ${actualChainId} matches expected ${EXPECTED_CHAIN_ID}.`);
}

async function runCycle(signer: ReturnType<typeof createLocalSigner>) {
  const opportunity = await findBestOpportunity();

  if (opportunity === null) {
    log("No profitable opportunity found this cycle.");
    return;
  }

  log(
    `Opportunity found: ${opportunity.sizeLabel}, sell WETH on ${opportunity.dexBuyName}, ` +
      `buy back on ${opportunity.dexSellName}, net profit (pre-gas) = ${opportunity.netProfit} wei WETH`
  );

  const gasPrice = await publicClient.getGasPrice();
  const estimatedGasCost = gasPrice * ESTIMATED_GAS_UNITS;
  const requiredProfit = estimatedGasCost * PROFIT_TO_GAS_SAFETY_MULTIPLE;

  log(
    `Gas check: price=${gasPrice} wei, estimated cost=${estimatedGasCost} wei, ` +
      `required profit (${PROFIT_TO_GAS_SAFETY_MULTIPLE}x safety margin)=${requiredProfit} wei`
  );

  if (opportunity.netProfit <= requiredProfit) {
    log("Opportunity does not clear gas cost + safety margin. Skipping.");
    return;
  }

  log("Opportunity clears gas threshold. Executing...");

  try {
    const hash = await executeOpportunity(signer, opportunity);
    log(`Execution succeeded. Transaction hash: ${hash}`);
  } catch (error) {
    log(`Execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  log("Arbix bot starting...");
  log(`Bot address: ${config.botAddress}`);
  log(`RPC: ${config.rpcUrl}`);
  log(`Poll interval: ${POLL_INTERVAL_MS}ms`);

  await assertCorrectChain();

  const signer = createLocalSigner(config.botPrivateKey, config.rpcUrl);

  // Basic infinite loop with sequential cycles — deliberately not using
  // setInterval, since that could overlap cycles if a scan+execute takes
  // longer than POLL_INTERVAL_MS. Each cycle fully completes before the
  // next one's delay begins.
  while (true) {
    try {
      await runCycle(signer);
    } catch (error) {
      log(`Unexpected error in cycle: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((error) => {
  log(`Fatal error, bot stopping: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
