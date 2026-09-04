import { encodeAbiParameters, encodeFunctionData, parseAbiParameters } from "viem";
import type { Signer } from "./signer.js";
import type { Opportunity } from "./opportunity.js";
import { addresses, arbix } from "./config.js";
import { publicClient } from "./market.js";

const flashLoanAbi = [
  {
    name: "requestFlashLoan",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "asset", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const DEADLINE_BUFFER_SECONDS = 300n;

/** Explicit gas limit for requestFlashLoan, deliberately generous above
 *  observed real gas usage (ArbixExecutor.executeArbitrage alone averages
 *  ~230k gas per forge --gas-report, plus flash loan overhead and two
 *  external adapter swap calls). Set explicitly to skip eth_estimateGas
 *  entirely — this RPC call has proven unreliable against our Anvil fork's
 *  lazy state-fetching from the public Arbitrum RPC, and in production a
 *  competitive bot benefits from skipping the estimation round-trip anyway. */
const EXECUTION_GAS_LIMIT = 1_000_000n;

function routerToAdapter(routerAddress: `0x${string}`): `0x${string}` {
  if (routerAddress.toLowerCase() === addresses.sushiRouter.toLowerCase()) {
    return arbix.sushiAdapter;
  }
  if (routerAddress.toLowerCase() === addresses.camelotRouter.toLowerCase()) {
    return arbix.camelotAdapter;
  }
  throw new Error(`No adapter mapped for router address: ${routerAddress}`);
}

function buildCalldata(opportunity: Opportunity, slippageBps: bigint): `0x${string}` {
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_BUFFER_SECONDS;
  const deadlineData = encodeAbiParameters(parseAbiParameters("uint256"), [deadline]);

  const dexBuyAdapter = routerToAdapter(opportunity.dexBuy);
  const dexSellAdapter = routerToAdapter(opportunity.dexSell);

  const minProfit = (opportunity.netProfit * (10_000n - slippageBps)) / 10_000n;

  const arbitrageParams = {
    tokenIn: addresses.weth,
    tokenOut: addresses.usdc,
    dexBuy: dexBuyAdapter,
    dexSell: dexSellAdapter,
    amountIn: opportunity.amountIn,
    minProfit: minProfit > 0n ? minProfit : 0n,
    minAmountOutBuy: 0n,
    minAmountOutSell: 0n,
    buyData: deadlineData,
    sellData: deadlineData,
  };

  const arbitrageParamsAbiType = parseAbiParameters(
    "(address tokenIn, address tokenOut, address dexBuy, address dexSell, uint256 amountIn, uint256 minProfit, uint256 minAmountOutBuy, uint256 minAmountOutSell, bytes buyData, bytes sellData)"
  );
  const encodedArbitrageParams = encodeAbiParameters(arbitrageParamsAbiType, [arbitrageParams]);

  const flashLoanParams = {
    asset: addresses.weth,
    amount: opportunity.amountIn,
    data: encodedArbitrageParams,
  };

  return encodeFunctionData({
    abi: flashLoanAbi,
    functionName: "requestFlashLoan",
    args: [flashLoanParams],
  });
}

/**
 * Thrown when the pre-submission simulation reverts. Distinguishes "the
 * trade is no longer valid" (caught cheaply, no gas spent) from a real
 * on-chain failure during actual submission, so callers can log/handle
 * these differently.
 */
export class SimulationFailedError extends Error {
  constructor(reason: string) {
    super(`Simulation failed, refusing to submit: ${reason}`);
    this.name = "SimulationFailedError";
  }
}

export async function executeOpportunity(
  signer: Signer,
  opportunity: Opportunity,
  slippageBps: bigint = 50n
): Promise<`0x${string}`> {
  const calldata = buildCalldata(opportunity, slippageBps);
  const account = signer.walletClient.account!;

  // Simulate via eth_call immediately before submitting. This costs no gas
  // and catches the common case where pool state (or the opportunity's
  // underlying assumption) has shifted since detection — e.g. another
  // trade already closed the spread, or a competing searcher front-ran it
  // in the same block window. Cheaper to catch here than to pay real gas
  // for an on-chain revert.
  try {
    await publicClient.call({
      account: account.address,
      to: arbix.flashLoan,
      data: calldata,
      gas: EXECUTION_GAS_LIMIT,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SimulationFailedError(reason);
  }

  const hash = await signer.walletClient.sendTransaction({
    account,
    chain: signer.walletClient.chain,
    to: arbix.flashLoan,
    data: calldata,
    gas: EXECUTION_GAS_LIMIT,
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}
