import { createWalletClient, http, type WalletClient, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";

/**
 * Signer abstraction: everything else in the bot depends on this interface,
 * not on how the key is actually stored. Swapping from a local private key
 * (dev/testing) to a hardware wallet or KMS-backed signer (production) later
 * means implementing this interface differently — no changes needed
 * anywhere else in the bot.
 */
export interface Signer {
  readonly address: Address;
  readonly walletClient: WalletClient;
}

/**
 * Local private-key signer. Suitable for local Anvil forks and early
 * development only. Never use this for a signer holding real funds —
 * production should use a hardware wallet or KMS-backed signer implementing
 * the same Signer interface.
 */
export function createLocalSigner(privateKey: `0x${string}`, rpcUrl: string): Signer {
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(rpcUrl),
  });

  return {
    address: account.address,
    walletClient,
  };
}
