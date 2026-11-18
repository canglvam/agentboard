// AgentBoard frontend — vanilla JS + ethers v6 (CDN), no build step, no backend.
// Name resolution (VALIDATED on mainnet 2026-11-18 against canglvam.ai):
//   SPACE ID tokenId = keccak256(label), e.g. keccak256("canglvam").
//   tokenURI(tokenId) = https://agentid.prd.space.id/metadata/<label>.json
//   (metadata "name" is the label WITHOUT the .ai suffix).
//   Forward (.ai -> address): ownerOf(keccak256(label)) — pure on-chain.
//   Reverse (address -> name): the registry is NOT enumerable
//   (tokenOfOwnerByIndex reverts) and the SPACE ID Web3 Name SDK v0.4.2
//   returns null for .ai, so there is no public reverse lookup. The UI
//   therefore shows a truncated address unless the connected user verifies
//   their own .ai name (ownerOf check) — stored only in their browser.
//   The contract NEVER stores names and this page is NOT a wallet-lookup
//   tool: a name is only shown for the connected wallet (after an on-chain
//   ownership check) and for leaderboard addresses whose name was verified
//   in this browser.
"use strict";

const CONFIG = window.AGENTBOARD_CONFIG || {
  network: "bscTestnet",
  chainId: 97,
  rpcUrl: "https://bsc-testnet.publicnode.com",
  explorer: "https://testnet.bscscan.com",
  agentBoard: "",
  agentIdRegistry: "",
  deployBlock: 0,
};
// No third-party name API is used: forward resolution is on-chain (see
// header comment). Reverse lookup is not publicly available for .ai.

const BOARD_ABI = [
  "function checkIn()",
  "function claimBadge()",
  "function tip(address to, string message) payable",
  "function hasAgentId(address account) view returns (bool)",
  "function getStats(address account) view returns (uint256,uint256,uint256,bool)",
  "function badgeTokenId(address account) view returns (uint256)",
  "function streak(address account) view returns (uint256)",
  "function totalCheckIns(address account) view returns (uint256)",
  "function hasBadge(address account) view returns (bool)",
  "event CheckIn(address indexed user, uint256 day, uint256 streak, uint256 totalCheckIns)",
  "event BadgeClaimed(address indexed user, uint256 indexed tokenId)",
  "event Tip(address indexed from, address indexed to, uint256 amount, string message)",
];
const REGISTRY_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
];

const $ = (id) => document.getElementById(id);
let provider = null; // ethers BrowserProvider
let signer = null;
let account = null;
let board = null; // write contract (signer)
let boardRead = null; // read contract (public RPC)
let registryRead = null;
let nameCache = {};
let resolvedTipTo = null;

function shortAddr(a) {
  return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
}

function showMsg(el, text, isError) {
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("error", !!isError);
}

async function fetchJsonMaybe(uri) {
  if (!uri) return null;
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      return JSON.parse(atob(uri.slice(29)));
    }
    if (uri.startsWith("data:application/json,")) {
      return JSON.parse(decodeURIComponent(uri.slice(25)));
    }
    const r = await fetch(uri);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Resolve a .ai display name for an address that holds an Agent ID.
// Order: (1) registry tokenOfOwnerByIndex -> tokenURI metadata (works on
// testnet mock, which is enumerable); (2) a name the connected user
// verified in this browser (localStorage, ownership proven on-chain);
// (3) truncated address fallback. Metadata "name" is the label without
// the .ai suffix, so ".ai" is appended for display.
async function resolveName(addr) {
  if (nameCache[addr]) return nameCache[addr];
  let name = null;
  try {
    const tokenId = await registryRead.tokenOfOwnerByIndex(addr, 0);
    const uri = await registryRead.tokenURI(tokenId);
    const meta = await fetchJsonMaybe(uri);
    if (meta && meta.name) name = meta.name.endsWith(".ai") ? meta.name : meta.name + ".ai";
  } catch { /* mainnet registry is not enumerable; fall through */ }
  if (!name) {
    try {
      const saved = JSON.parse(localStorage.getItem("agentboard:verified-names") || "{}");
      if (saved[addr.toLowerCase()]) name = saved[addr.toLowerCase()];
    } catch { /* ignore */ }
  }
  name = name || shortAddr(addr);
  nameCache[addr] = name;
  return name;
}

// Forward-resolve a typed "name.ai" to an address — pure on-chain:
// tokenId = keccak256(label), then ownerOf(tokenId) on the registry.
// Validated on mainnet 2026-11-18: keccak256("canglvam") -> ownerOf ->
// 0x3424ed37Fa7AE383e2410583B667fFc541daee9d. Only applies on mainnet
// (chain 56); the testnet mock uses small-int tokenIds, so there the tip
// box falls back to a pasted 0x address.
async function resolveNameToAddress(name) {
  if (CONFIG.chainId !== 56) return null;
  const label = name.toLowerCase().replace(/\.ai$/, "");
  if (!/^[a-z0-9]{3,15}$/.test(label)) return null;
  try {
    const tokenId = ethers.solidityPackedKeccak256(["string"], [label]);
    const owner = await registryRead.ownerOf(tokenId);
    if (owner === ethers.ZeroAddress) return null;
    return owner;
  } catch {
    return null;
  }
}

// Let the connected user prove and display their own .ai name: the
// frontend checks on-chain that ownerOf(keccak256(label)) === account.
// Nothing is trusted from typing alone.
async function verifyMyName() {
  const msg = $("verify-name-msg");
  const raw = $("my-name-input").value.trim().toLowerCase();
  if (!raw.endsWith(".ai")) { showMsg(msg, "Enter your name as name.ai.", true); return; }
  const addr = await resolveNameToAddress(raw);
  if (!addr || addr.toLowerCase() !== account.toLowerCase()) {
    showMsg(msg, "That .ai name does not belong to the connected wallet (" + shortAddr(account) + ").", true);
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem("agentboard:verified-names") || "{}");
    saved[account.toLowerCase()] = raw;
    localStorage.setItem("agentboard:verified-names", JSON.stringify(saved));
  } catch { /* storage unavailable; display only for this session */ }
  nameCache[account] = raw;
  $("agent-name").textContent = raw;
  showMsg(msg, "Verified ✓ — " + raw + " belongs to this wallet.");
  await refreshBoard();
}

async function refreshMyStats() {
  if (!account) return;
  const [streak, total, , hasBadge] = await boardRead.getStats(account);
  $("stat-streak").textContent = streak.toString();
  $("stat-total").textContent = total.toString();
  $("stat-badge").textContent = hasBadge ? "#" + (await boardRead.badgeTokenId(account)).toString() : "not claimed";
  $("checkin-btn").disabled = false;
  $("badge-btn").disabled = hasBadge;
  $("badge-btn").textContent = hasBadge ? "Badge claimed ✓" : "Claim my free badge";
}

async function refreshBoard() {
  const lb = $("leaderboard");
  const tp = $("tippers");
  const rt = $("recent-tips");
  try {
    const fromBlock = CONFIG.deployBlock || 0;
    const checkIns = await boardRead.queryFilter(boardRead.filters.CheckIn, fromBlock);
    const tips = await boardRead.queryFilter(boardRead.filters.Tip, fromBlock);
    const latest = {};
    const totals = {};
    for (const ev of checkIns) {
      latest[ev.args.user] = { streak: Number(ev.args.streak), total: Number(ev.args.totalCheckIns) };
      totals[ev.args.user] = Number(ev.args.totalCheckIns);
    }
    const ranked = Object.entries(latest).sort((a, b) => b[1].streak - a[1].streak).slice(0, 20);
    lb.innerHTML = ranked.length
      ? ""
      : "<li>No check-ins yet — be the first.</li>";
    for (const [addr, s] of ranked) {
      const li = document.createElement("li");
      li.textContent = (await resolveName(addr)) + " — " + s.streak + " day streak (" + s.total + " check-ins)";
      lb.appendChild(li);
    }
    const tipped = {};
    for (const ev of tips) {
      tipped[ev.args.to] = (tipped[ev.args.to] || 0n) + ev.args.amount;
    }
    const topTippers = Object.entries(tipped).sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 10);
    tp.innerHTML = topTippers.length ? "" : "<li>No tips yet.</li>";
    for (const [addr, amt] of topTippers) {
      const li = document.createElement("li");
      li.textContent = (await resolveName(addr)) + " — " + ethers.formatEther(amt) + " BNB received";
      tp.appendChild(li);
    }
    rt.innerHTML = tips.length ? "" : "<li>No tips yet.</li>";
    for (const ev of tips.slice(-10).reverse()) {
      const li = document.createElement("li");
      li.textContent =
        (await resolveName(ev.args.from)) + " → " + (await resolveName(ev.args.to)) +
        ": " + ethers.formatEther(ev.args.amount) + " BNB" +
        (ev.args.message ? " — “" + ev.args.message + "”" : "");
      rt.appendChild(li);
    }
  } catch (e) {
    lb.innerHTML = "<li>Could not load the board: " + e.message + "</li>";
  }
}

async function connect() {
  const errEl = $("connect-error");
  errEl.hidden = true;
  if (!window.ethereum) {
    showMsg(errEl, "No wallet found. Open this page in the Binance app's built-in browser, or install a wallet.", true);
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CONFIG.chainId) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CONFIG.chainId.toString(16) }],
        });
      } catch (switchErr) {
        showMsg(errEl, "Please switch your wallet to " + CONFIG.network + " (chain " + CONFIG.chainId + ").", true);
        return;
      }
      provider = new ethers.BrowserProvider(window.ethereum);
    }
    signer = await provider.getSigner();
    account = await signer.getAddress();
    const rpc = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    boardRead = new ethers.Contract(CONFIG.agentBoard, BOARD_ABI, rpc);
    registryRead = new ethers.Contract(CONFIG.agentIdRegistry, REGISTRY_ABI, rpc);
    board = new ethers.Contract(CONFIG.agentBoard, BOARD_ABI, signer);

    $("account-line").textContent = "Connected: " + account;
    $("network-name").textContent = CONFIG.network + " (chain " + CONFIG.chainId + ")";
    $("connect-btn").textContent = "Connected ✓";
    $("connect-btn").disabled = true;
    $("id-card").hidden = false;
    $("actions-card").hidden = false;

    const holds = await boardRead.hasAgentId(account);
    if (!holds) {
      $("agent-name").textContent = shortAddr(account);
      $("agent-status").textContent = "This address does not hold an Agent ID yet. Switch to your Agentic Wallet (the address that holds your .ai name) or claim an Agent ID in the Binance app first — check-in, badge and tips are gated on holding one.";
      $("checkin-btn").disabled = true;
      $("badge-btn").disabled = true;
    } else {
      const name = await resolveName(account);
      $("agent-name").textContent = name;
      $("agent-status").textContent = "Agent ID confirmed on-chain ✓";
      await refreshMyStats();
    }
    await refreshBoard();
  } catch (e) {
    showMsg(errEl, "Connection failed: " + (e.reason || e.message), true);
  }
}

async function doCheckIn() {
  const msg = $("action-msg");
  try {
    showMsg(msg, "Sending check-in — confirm in your wallet…");
    const tx = await board.checkIn();
    showMsg(msg, "Waiting for confirmation… (" + tx.hash.slice(0, 10) + "…)");
    await tx.wait();
    showMsg(msg, "Checked in ✓");
    await refreshMyStats();
    await refreshBoard();
  } catch (e) {
    showMsg(msg, "Check-in failed: " + (e.reason || e.message), true);
  }
}

async function doClaimBadge() {
  const msg = $("action-msg");
  try {
    showMsg(msg, "Claiming badge — confirm in your wallet…");
    const tx = await board.claimBadge();
    await tx.wait();
    showMsg(msg, "Badge claimed ✓ — one per Agent ID, yours forever.");
    await refreshMyStats();
    await refreshBoard();
  } catch (e) {
    showMsg(msg, "Badge claim failed: " + (e.reason || e.message), true);
  }
}

async function doResolveTip() {
  const msg = $("tip-msg");
  const raw = $("tip-to").value.trim();
  resolvedTipTo = null;
  $("tip-send-btn").disabled = true;
  $("tip-preview").hidden = true;
  if (!raw) { showMsg(msg, "Enter a recipient first.", true); return; }
  let addr = null;
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    addr = raw;
  } else if (raw.toLowerCase().endsWith(".ai")) {
    addr = await resolveNameToAddress(raw.toLowerCase());
    if (!addr) {
      showMsg(msg, "Could not resolve “" + raw + "” to an address on this network. Paste the recipient's 0x wallet address instead — the contract still verifies on-chain that they hold an Agent ID.", true);
      return;
    }
  } else {
    showMsg(msg, "Enter a .ai name or a 0x wallet address.", true);
    return;
  }
  const holds = await boardRead.hasAgentId(addr);
  if (!holds) {
    showMsg(msg, "That address does not hold an Agent ID — tips can only go to Agent ID holders.", true);
    return;
  }
  resolvedTipTo = addr;
  const amount = $("tip-amount").value || "0";
  $("tip-preview").hidden = false;
  $("tip-preview").textContent =
    "Send " + amount + " BNB to " + (await resolveName(addr)) + " (" + shortAddr(addr) + "). 100% forwarded, no fee.";
  $("tip-send-btn").disabled = false;
  showMsg(msg, "Recipient verified ✓ — check the preview, then send.");
}

async function doSendTip() {
  const msg = $("tip-msg");
  if (!resolvedTipTo) { showMsg(msg, "Check the recipient first.", true); return; }
  try {
    const amount = ethers.parseEther($("tip-amount").value || "0");
    const message = $("tip-message").value || "";
    showMsg(msg, "Sending tip — confirm the exact amount in your wallet…");
    const tx = await board.tip(resolvedTipTo, message, { value: amount });
    await tx.wait();
    showMsg(msg, "Tip sent ✓ — 100% forwarded to the recipient.");
    await refreshBoard();
  } catch (e) {
    showMsg(msg, "Tip failed: " + (e.reason || e.message), true);
  }
}

$("connect-btn").addEventListener("click", connect);
$("verify-name-btn").addEventListener("click", verifyMyName);
$("checkin-btn").addEventListener("click", doCheckIn);
$("badge-btn").addEventListener("click", doClaimBadge);
$("refresh-btn").addEventListener("click", refreshBoard);
$("tip-resolve-btn").addEventListener("click", doResolveTip);
$("tip-send-btn").addEventListener("click", doSendTip);

$("contract-addr").textContent = CONFIG.agentBoard || "(deploy first — see config.js)";
$("registry-addr").textContent = CONFIG.agentIdRegistry || "—";
$("network-name").textContent = CONFIG.network + " (chain " + CONFIG.chainId + ")";
if (CONFIG.agentBoard) refreshBoard();
