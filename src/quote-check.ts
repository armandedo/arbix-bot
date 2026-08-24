import { addresses } from "./config.js";
import { getQuote } from "./market.js";

const amounts = {
  "0.001 WETH": 1_000000000000000n,
  "0.01 WETH": 10_000000000000000n,
  "0.1 WETH": 100_000000000000000n,
  "1 WETH": 1_000000000000000000n,
};

for (const [label, amountIn] of Object.entries(amounts)) {
  const sushiQuote = await getQuote(addresses.sushiRouter, addresses.weth, addresses.usdc, amountIn);
  const camelotQuote = await getQuote(addresses.camelotRouter, addresses.weth, addresses.usdc, amountIn);

  const sushiImpliedPrice = Number(sushiQuote) / Number(amountIn) * 1e12; // scale for decimals
  const camelotImpliedPrice = Number(camelotQuote) / Number(amountIn) * 1e12;

  console.log(`${label}: Sushi implied price ~$${sushiImpliedPrice.toFixed(2)}, Camelot implied price ~$${camelotImpliedPrice.toFixed(2)}`);
}
