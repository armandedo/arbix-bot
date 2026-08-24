import { createPublicClient, http, type Address } from "viem";
import { arbitrum } from "viem/chains";
import { config } from "./config.js";

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(config.rpcUrl),
});

const uniswapV2RouterAbi = [
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

/**
 * Fetches a live swap quote from any UniswapV2-interface-compatible router.
 * Read-only — costs no gas.
 */
export async function getQuote(
  routerAddress: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<bigint> {
  const amounts = await publicClient.readContract({
    address: routerAddress,
    abi: uniswapV2RouterAbi,
    functionName: "getAmountsOut",
    args: [amountIn, [tokenIn, tokenOut]],
  });

  return amounts[amounts.length - 1];
}

export { publicClient };
