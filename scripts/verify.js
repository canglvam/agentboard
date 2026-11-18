// Verify AgentBoard source on BscScan (required for hackathon eligibility).
// Usage: BSCSCAN_API_KEY=... npx hardhat run scripts/verify.js --network bscTestnet
//   (reads deployments/<network>.json; defaults to bscTestnet, set NETWORK=bsc for mainnet)
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = process.env.NETWORK || hre.network.name;
  const depPath = path.join(__dirname, "..", "deployments", network + ".json");
  if (!fs.existsSync(depPath)) throw new Error("No deployment file: " + depPath);
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  console.log("Verifying AgentBoard", dep.agentBoard, "on", network);
  await hre.run("verify:verify", {
    address: dep.agentBoard,
    constructorArguments: [dep.agentIdRegistry],
  });
  console.log("Verified.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
