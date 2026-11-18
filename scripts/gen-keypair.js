// Generate a fresh EVM keypair and store it as JSON with mode 600.
// Usage: node scripts/gen-keypair.js <output-path> <purpose>
// Prints ONLY the public address — the private key is never printed.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const outPath = process.argv[2];
const purpose = process.argv[3] || "agentboard deployer";
if (!outPath) {
  console.error("Usage: node scripts/gen-keypair.js <output-path> <purpose>");
  process.exit(1);
}

const wallet = ethers.Wallet.createRandom();
const record = {
  address: wallet.address,
  privateKey: wallet.privateKey,
  purpose,
  createdAt: new Date().toISOString(),
  warning: "PRIVATE KEY — never share, never commit, never print.",
};
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), JSON.stringify(record, null, 2), { mode: 0o600 });
fs.chmodSync(path.resolve(outPath), 0o600);
console.log("Generated keypair for:", purpose);
console.log("Address:", wallet.address);
console.log("Saved to:", path.resolve(outPath), "(mode 600)");
