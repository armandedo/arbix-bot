import { addresses } from "./config.js";
import { getQuote as liveGetQuote } from "./market.js";

/** Verified on-chain via Pool.FLASHLOAN_PREMIUM_TOTAL() — see git history. */
const AAVE_PREMIUM_BPS = 5n;
const BPS_DENOMINATOR = 10_000n;

/** Trade sizes to scan, in WETH (18 decimals). Price impact grows fast with
 *  size on these pools (verified: ~0.4% spread at 0.001 WETH, degrading
 *  sharply by 1 WETH), so we scan a spread of sizes rather than guessing one. */
const SCAN_SIZES: { label: string; amountIn: bigint }[] = [
  { label: "0.001 WETH", amountIn: 1_000000000000000n },
  { label: "0.005 WETH", amountIn: 5_000000000000000n },
  { label: "0.01 WETH", amountIn: 10_000000000000000n },
  { label: "0.05 WETH", amountIn: 50_000000000000000n },
  { label: "0.1 WETH", amountIn: 100_000000000000000n },
  { label: "0.5 WETH", amountIn: 500_000000000000000n },
  { label: "1 WETH", amountIn: 1_000000000000000000n },
];

export interface Opportunity {
  amountIn: bigint;
  sizeLabel: string;
  dexBuy: `0x${string}`;
  dexSell: `0x${string}`;
  dexBuyName: string;
  dexSellName: string;
  grossReturn: bigint;
  repaymentOwed: bigint;
  netProfit: bigint;
}

const DEXES = [
  { address: addresses.sushiRouter, name: "SushiSwap" },
  { address: addresses.camelotRouter, name: "Camelot" },
];

export type QuoteFn = (
  routerAddress: `0x${string}`,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint
) => Promise<bigint>;

async function simulateRoundTrip(
  amountIn: bigint,
  buyDex: { address: `0x${string}`; name: string },
  sellDex: { address: `0x${string}`; name: string },
  quoteFn: QuoteFn
): Promise<{ grossReturn: bigint; netProfit: bigint }> {
  const usdcReceived = await quoteFn(buyDex.address, addresses.weth, addresses.usdc, amountIn);
  const wethReturned = await quoteFn(sellDex.address, addresses.usdc, addresses.weth, usdcReceived);

  const premium = (amountIn * AAVE_PREMIUM_BPS) / BPS_DENOMINATOR;
  const repaymentOwed = amountIn + premium;
  const netProfit = wethReturned - repaymentOwed;

  return { grossReturn: wethReturned, netProfit };
}

/**
 * Scans all configured sizes across both DEX-direction combinations and
 * returns the single most profitable opportunity found, or null if nothing
 * is profitable net of the Aave premium (gas is NOT accounted for here —
 * that's the caller's responsibility, since gas cost depends on current
 * network conditions at execution time, not detection time).
 *
 * quoteFn defaults to the real on-chain getQuote, but can be overridden
 * (e.g. in tests) to verify the selection/sizing logic in isolation from
 * network calls.
 */
export async function findBestOpportunity(quoteFn: QuoteFn = liveGetQuote): Promise<Opportunity | null> {
  let best: Opportunity | null = null;

  for (const size of SCAN_SIZES) {
    for (const [buyDex, sellDex] of [
      [DEXES[0], DEXES[1]],
      [DEXES[1], DEXES[0]],
    ] as const) {
      const { grossReturn, netProfit } = await simulateRoundTrip(size.amountIn, buyDex, sellDex, quoteFn);

      if (netProfit > 0n && (best === null || netProfit > best.netProfit)) {
        best = {
          amountIn: size.amountIn,
          sizeLabel: size.label,
          dexBuy: buyDex.address,
          dexSell: sellDex.address,
          dexBuyName: buyDex.name,
          dexSellName: sellDex.name,
          grossReturn,
          repaymentOwed: size.amountIn + (size.amountIn * AAVE_PREMIUM_BPS) / BPS_DENOMINATOR,
          netProfit,
        };
      }
    }
  }

  return best;
}
