import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}. Check your .env file.`);
  }
  return value;
}

export const config = {
  rpcUrl: requireEnv("ARBITRUM_SEPOLIA_RPC_URL"), // points at local Anvil fork
  botPrivateKey: requireEnv("BOT_PRIVATE_KEY") as `0x${string}`,
  botAddress: requireEnv("BOT_ADDRESS") as `0x${string}`,
} as const;

// Real Arbitrum mainnet addresses — valid on our local Anvil fork since it
// forks live mainnet state. Verified against test/fork/*.sol constants.
export const addresses = {
  aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as `0x${string}`,
  sushiRouter: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506" as `0x${string}`,
  camelotRouter: "0xc873fEcbd354f5A56E00E710B90EF4201db2448d" as `0x${string}`,
  weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`,
  usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`,
} as const;

// Arbix contracts deployed via script/DeployLocal.s.sol onto the local
// Anvil fork. Redeploy and update these if the fork is restarted, since
// Anvil resets all state (including deployed contracts) on restart.
export const arbix = {
  executor: "0x72C5CB4fb5ba4DF62Ca066FA41bd38AdBBe5D378" as `0x${string}`,
  flashLoan: "0xA2bE5E5f0bC16AC57D5839Af3D52E206d7B38434" as `0x${string}`,
  sushiAdapter: "0xa2FF6889026E0ae606d710A8405a6328adEDAF77" as `0x${string}`,
  camelotAdapter: "0xC3f52D816A522848addE7d80b9f9Eda3344Cc874" as `0x${string}`,
} as const;
