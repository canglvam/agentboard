const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("AgentBoard", function () {
  async function deployFixture() {
    const [owner, alice, bob, carol] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockAgentId");
    const mock = await Mock.deploy();
    const Board = await ethers.getContractFactory("AgentBoard");
    const board = await Board.deploy(await mock.getAddress());
    // Alice + Bob hold mock Agent IDs (alice.ai, bob.ai). Carol holds none.
    await mock.mint(alice.address, 1, "alice.ai");
    await mock.mint(bob.address, 2, "bob.ai");
    return { mock, board, owner, alice, bob, carol };
  }

  it("deployment: registry wired, owner is deployer, no funds held", async function () {
    const { board, mock, owner } = await loadFixture(deployFixture);
    expect(await board.agentIdRegistry()).to.equal(await mock.getAddress());
    expect(await board.owner()).to.equal(owner.address);
    expect(await ethers.provider.getBalance(await board.getAddress())).to.equal(0);
  });

  it("hasAgentId: true for ID holders, false otherwise", async function () {
    const { board, alice, carol } = await loadFixture(deployFixture);
    expect(await board.hasAgentId(alice.address)).to.equal(true);
    expect(await board.hasAgentId(carol.address)).to.equal(false);
  });

  it("checkIn reverts without an Agent ID", async function () {
    const { board, carol } = await loadFixture(deployFixture);
    await expect(board.connect(carol).checkIn()).to.be.revertedWithCustomError(board, "NeedAgentId");
  });

  it("checkIn works once per UTC day; streak 1 on first day", async function () {
    const { board, alice } = await loadFixture(deployFixture);
    await expect(board.connect(alice).checkIn())
      .to.emit(board, "CheckIn")
      .withArgs(alice.address, await currentDay(), 1, 1);
    expect(await board.streak(alice.address)).to.equal(1);
    expect(await board.totalCheckIns(alice.address)).to.equal(1);
    await expect(board.connect(alice).checkIn()).to.be.revertedWithCustomError(
      board,
      "AlreadyCheckedInToday"
    );
  });

  it("streak increments on consecutive days", async function () {
    const { board, alice } = await loadFixture(deployFixture);
    await board.connect(alice).checkIn();
    await time.increase(86400); // exactly one UTC day later
    await board.connect(alice).checkIn();
    expect(await board.streak(alice.address)).to.equal(2);
    await time.increase(86400);
    await board.connect(alice).checkIn();
    expect(await board.streak(alice.address)).to.equal(3);
    expect(await board.totalCheckIns(alice.address)).to.equal(3);
  });

  it("streak resets to 1 after a missed day", async function () {
    const { board, alice } = await loadFixture(deployFixture);
    await board.connect(alice).checkIn();
    await time.increase(86400);
    await board.connect(alice).checkIn();
    expect(await board.streak(alice.address)).to.equal(2);
    await time.increase(2 * 86400); // skip one full day
    await board.connect(alice).checkIn();
    expect(await board.streak(alice.address)).to.equal(1);
    expect(await board.totalCheckIns(alice.address)).to.equal(3);
  });

  it("claimBadge mints exactly one badge per holder, with on-chain metadata", async function () {
    const { board, alice } = await loadFixture(deployFixture);
    await expect(board.connect(alice).claimBadge())
      .to.emit(board, "BadgeClaimed")
      .withArgs(alice.address, 1);
    expect(await board.hasBadge(alice.address)).to.equal(true);
    expect(await board.badgeTokenId(alice.address)).to.equal(1);
    expect(await board.balanceOf(alice.address)).to.equal(1);
    expect(await board.ownerOf(1)).to.equal(alice.address);
    const uri = await board.tokenURI(1);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
    const json = JSON.parse(Buffer.from(uri.slice(29), "base64").toString("utf8"));
    expect(json.name).to.equal("AgentBoard Badge #1");
    await expect(board.connect(alice).claimBadge()).to.be.revertedWithCustomError(
      board,
      "BadgeAlreadyClaimed"
    );
  });

  it("claimBadge reverts without an Agent ID", async function () {
    const { board, carol } = await loadFixture(deployFixture);
    await expect(board.connect(carol).claimBadge()).to.be.revertedWithCustomError(board, "NeedAgentId");
  });

  it("tip forwards 100% to the recipient; contract keeps nothing", async function () {
    const { board, alice, bob } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("0.01");
    // Event assertion and balance assertion must be separate expects:
    // hardhat-chai-matchers cannot chain .emit with .changeEtherBalance.
    await expect(board.connect(alice).tip(bob.address, "great build!", { value: amount }))
      .to.emit(board, "Tip")
      .withArgs(alice.address, bob.address, amount, "great build!");
    await expect(board.connect(alice).tip(bob.address, "again", { value: amount })).to.changeEtherBalance(
      bob,
      amount
    );
    expect(await ethers.provider.getBalance(await board.getAddress())).to.equal(0);
  });

  it("tip reverts: zero value, non-holder sender, non-holder recipient, long message", async function () {
    const { board, alice, bob, carol } = await loadFixture(deployFixture);
    await expect(
      board.connect(alice).tip(bob.address, "hi", { value: 0 })
    ).to.be.revertedWithCustomError(board, "TipValueZero");
    await expect(
      board.connect(carol).tip(bob.address, "hi", { value: 100 })
    ).to.be.revertedWithCustomError(board, "NeedAgentId");
    await expect(
      board.connect(alice).tip(carol.address, "hi", { value: 100 })
    ).to.be.revertedWithCustomError(board, "NeedAgentId");
    await expect(
      board.connect(alice).tip(bob.address, "x".repeat(281), { value: 100 })
    ).to.be.revertedWithCustomError(board, "TipMessageTooLong");
  });

  it("pause blocks actions and only the owner can pause/unpause", async function () {
    const { board, alice, owner } = await loadFixture(deployFixture);
    await expect(board.connect(alice).pause()).to.be.revertedWithCustomError(
      board,
      "OwnableUnauthorizedAccount"
    );
    await board.connect(owner).pause();
    await expect(board.connect(alice).checkIn()).to.be.revertedWithCustomError(board, "EnforcedPause");
    await expect(board.connect(alice).claimBadge()).to.be.revertedWithCustomError(
      board,
      "EnforcedPause"
    );
    await board.connect(owner).unpause();
    await board.connect(alice).checkIn();
    expect(await board.streak(alice.address)).to.equal(1);
  });

  it("getStats returns streak / totals / last day / badge flag", async function () {
    const { board, alice } = await loadFixture(deployFixture);
    await board.connect(alice).checkIn();
    await board.connect(alice).claimBadge();
    const [streak, total, lastDay, hasBadge] = await board.getStats(alice.address);
    expect(streak).to.equal(1);
    expect(total).to.equal(1);
    expect(lastDay).to.equal(await currentDay());
    expect(hasBadge).to.equal(true);
  });

  async function currentDay() {
    return Math.floor((await time.latest()) / 86400);
  }
});
