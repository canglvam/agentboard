// Testnet E2E: funds 3 fresh test wallets from the deployer, mints them mock
// Agent IDs, then runs the full user flow against the deployed testnet
// contracts: checkIn, claimBadge, tip, and event/leaderboard reads.
// Test wallet keypairs are saved to deployer/testnet-wallets.json (mode 600)
// and NEVER printed. Requires the deployer to hold >= 0.1 tBNB.
// Usage: node wrapper with PRIVATE_KEY + TEST_WALLETS_FILE env (see README).
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const TEST_NAMES = ["alice.ai", "bob.ai", "carol.ai"];

async function main() {
  const network = hre.network.name;
  if (network !== "bscTestnet") throw new Error("E2E only on bscTestnet (got " + network + ")");
  const depPath = path.join(__dirname, "..", "deployments", "bscTestnet.json");
  if (!fs.existsSync(depPath)) throw new Error("Deploy first: deployments/bscTestnet.json missing");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  const [deployer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  const walletsFile =
    process.env.TEST_WALLETS_FILE ||
    path.join(process.env.HOME, "workspace/binance-agent-id-hackathon/deployer/testnet-wallets.json");

  let wallets;
  if (fs.existsSync(walletsFile)) {
    wallets = JSON.parse(fs.readFileSync(walletsFile, "utf8")).map(
      (w) => new hre.ethers.Wallet(w.privateKey, provider)
    );
    console.log("Loaded 3 test wallets from", walletsFile);
  } else {
    wallets = TEST_NAMES.map(() => hre.ethers.Wallet.createRandom().connect(provider));
    const record = wallets.map((w, i) => ({
      name: TEST_NAMES[i],
      address: w.address,
      privateKey: w.privateKey,
    }));
    fs.mkdirSync(path.dirname(walletsFile), { recursive: true });
    fs.writeFileSync(walletsFile, JSON.stringify(record, null, 2), { mode: 0o600 });
    fs.chmodSync(walletsFile, 0o600);
    console.log("Generated 3 test wallets, saved to", walletsFile, "(mode 600)");
  }
  wallets.forEach((w, i) => console.log("  test wallet", i, TEST_NAMES[i], w.address));

  const deployerBal = await provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(deployerBal), "tBNB");
  if (deployerBal < hre.ethers.parseEther("0.1")) {
    throw new Error("Deployer needs >= 0.1 tBNB. Fund " + deployer.address + " from the BSC testnet faucet first.");
  }

  const mock = await hre.ethers.getContractAt("MockAgentId", dep.mockAgentId, deployer);
  const board = await hre.ethers.getContractAt("AgentBoard", dep.agentBoard, deployer);

  // Fund each test wallet with 0.02 tBNB for gas.
  for (const w of wallets) {
    const bal = await provider.getBalance(w.address);
    if (bal < hre.ethers.parseEther("0.01")) {
      const tx = await deployer.sendTransaction({ to: w.address, value: hre.ethers.parseEther("0.02") });
      await tx.wait();
      console.log("Funded", w.address, "with 0.02 tBNB");
    }
  }

  // Mint a mock Agent ID to each test wallet (tokenIds 1..3).
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    if ((await mock.balanceOf(w.address)) === 0n) {
      const tx = await mock.mint(w.address, i + 1, TEST_NAMES[i]);
      await tx.wait();
      console.log("Minted mock ID", TEST_NAMES[i], "->", w.address);
    }
  }

  const results = { network, agentBoard: dep.agentBoard, steps: {} };
  const step = (name, ok, detail) => {
    results.steps[name] = { ok, detail };
    console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
    if (!ok) throw new Error("E2E step failed: " + name);
  };

  // 1. checkIn for all three.
  for (const w of wallets) {
    const tx = await board.connect(w).checkIn();
    await tx.wait();
  }
  step("checkIn x3", true, "all three wallets checked in");

  // 2. Second check-in same day must revert.
  try {
    await board.connect(wallets[0]).checkIn();
    step("second checkIn same day reverts", false, "did not revert");
  } catch (e) {
    step("second checkIn same day reverts", true, "reverted as expected");
  }

  // 3. claimBadge for all three.
  for (const w of wallets) {
    const tx = await board.connect(w).claimBadge();
    await tx.wait();
  }
  step("claimBadge x3", true, "badge #1, #2, #3 minted");

  // 4. Tip: alice -> bob, 0.001 tBNB, message.
  const tipAmount = hre.ethers.parseEther("0.001");
  const bobBefore = await provider.getBalance(wallets[1].address);
  const tipTx = await board.connect(wallets[0]).tip(wallets[1].address, "great streak!", { value: tipAmount });
  await tipTx.wait();
  const bobAfter = await provider.getBalance(wallets[1].address);
  step("tip forwards 100%", bobAfter - bobBefore === tipAmount, "bob received exactly 0.001 tBNB");

  // 5. Contract holds no funds.
  const boardBal = await provider.getBalance(dep.agentBoard);
  step("contract balance is 0", boardBal === 0n, "balance " + hre.ethers.formatEther(boardBal));

  // 6. Event reads (the leaderboard source of truth).
  const checkIns = await board.queryFilter(board.filters.CheckIn, dep.deployBlock);
  const badges = await board.queryFilter(board.filters.BadgeClaimed, dep.deployBlock);
  const tips = await board.queryFilter(board.filters.Tip, dep.deployBlock);
  step(
    "event reads",
    checkIns.length >= 3 && badges.length >= 3 && tips.length >= 1,
    `CheckIn=${checkIns.length} BadgeClaimed=${badges.length} Tip=${tips.length}`
  );
  const streaks = {};
  for (const ev of checkIns) streaks[ev.args.user] = Number(ev.args.streak);
  console.log("Leaderboard (streaks):", JSON.stringify(streaks));

  // 7. Stats view per wallet.
  for (const w of wallets) {
    const [streak, total, , hasBadge] = await board.getStats(w.address);
    if (streak !== 1n || total !== 1n || !hasBadge) throw new Error("bad stats for " + w.address);
  }
  step("getStats x3", true, "streak=1 total=1 hasBadge=true for all");

  const outPath = path.join(__dirname, "..", "deployments", "bscTestnet-e2e.json");
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log("E2E ALL PASS. Results:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
