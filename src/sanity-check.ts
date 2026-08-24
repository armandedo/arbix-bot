import { config } from "./config.js";
import { createLocalSigner } from "./signer.js";

const signer = createLocalSigner(config.botPrivateKey, config.rpcUrl);

console.log("Derived address:", signer.address);
console.log("Expected address:", config.botAddress);
console.log("Match:", signer.address.toLowerCase() === config.botAddress.toLowerCase());
