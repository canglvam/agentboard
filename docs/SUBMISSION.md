# AgentBoard — Hackathon Submission Draft

**Status:** DEPLOYED on BNB Chain mainnet 2026-11-18 ~21:34 JST; source verified via Sourcify (exact match). BscScan native verification still pending (needs a free BscScan API key).
Updated: 2026-11-18 22:40 JST — repo public, Pages live, 0 contract interactions yet.

## Project

- **Name:** AgentBoard
- **One-liner:** The reputation board for Agent ID holders — daily check-ins build a public streak tied to your `.ai` name, one free badge per ID, and tips between agents.
- **Website:** https://canglvam.github.io/agentboard/ — GitHub Pages (main /docs), live 2026-11-18 22:38 JST, verified HTTP 200 with correct content.
- **Repo:** https://github.com/canglvam/agentboard (public, main HEAD `2ed7d50`)
- **Category:** Agent ID Innovation Award (also counts for Pioneer on-chain ranking).

## Contracts

| Item | Address |
|---|---|
| AgentBoard (BSC testnet, chain 97) | TBD after testnet deploy — see `deployments/bscTestnet.json` |
| Mock Agent ID registry (testnet only) | TBD — see `deployments/bscTestnet.json` |
| AgentBoard (BNB Chain mainnet, chain 56) | `0xe5536db2272d650c06acee2e3ba8ac5df518f1e3` — deployed 2026-11-18, block 134312023, tx `0x9fc03b2fda198b0b3963e0cfeb0f2e73fe8def21acd20f0092cb5b917656733a` — https://bscscan.com/address/0xe5536db2272d650c06acee2e3ba8ac5df518f1e3 |
| Agent ID registry (mainnet, real) | `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` (SPACE ID ERC-721) |

- Source verified on BscScan: mainnet — **Sourcify exact match (creation + runtime), 2026-11-18**, https://sourcify.dev/#/lookup/0xe5536db2272d650c06acee2e3ba8ac5df518f1e3 (BscScan displays Sourcify-verified source; BscScan's own Etherscan-API verification still pending — `scripts/verify.js` needs a free `BSCSCAN_API_KEY`, none exists in the project/env; the installed hardhat-verify's Sourcify path is also broken — it calls the removed Sourcify API v1 — so Sourcify v2 was verified directly via its API). Testnet TBD (deploy blocked on tBNB, see below).
- Deploy cost: 2,181,624 gas × 0.05 gwei = **~0.000109 BNB** (~$0.07). Deployer balance after deploy: **0.02088098 BNB** (funded 0.02099 BNB).
- On-chain read-checks after deploy (via BSC RPC, 2026-11-18): bytecode present; `owner` = deployer `0x179c14c0A2281cEBc4570e008F870AA7C700EeD1`; `agentIdRegistry` = real registry; `paused` = false; `hasAgentId(0x3424ed37Fa7AE383e2410583B667fFc541daee9d)` = true; `getStats` for that wallet = streak 0 / total 0 / last day 0 / no badge (fresh, no check-in yet); contract balance **0 BNB**; no withdraw function in source (verified by reading `contracts/AgentBoard.sol`).
- Deploy note: the first `deploy.js` run threw mid-send because `bsc.publicnode.com` rejected an archive request (`getTransaction`) — but the deployment tx had already been broadcast and mined. The contract address, tx hash and block were recovered by scanning recent blocks via `bsc-dataseed.binance.org`; `deployments/bsc.json` and `frontend/config.js` were written from the recovered receipt.
- Repo: public, MIT. No token launch, no presale, no liquidity.

## How Agent ID is used

1. **Access control (gate):** every state-changing function (`checkIn`,
   `claimBadge`, `tip`) requires `balanceOf(msg.sender) > 0` on the Agent ID
   registry — checked on-chain in the contract, not in the UI.
2. **Identity:** streaks, totals and badges accrue to the soulbound Agent ID
   address. The ID cannot be transferred, so reputation cannot be bought.
3. **Payments:** `tip()` requires the recipient to hold an Agent ID too
   (`balanceOf(to) > 0`); the `.ai` name is the payment address. 100% of the
   tip is forwarded immediately; the contract keeps no fee and holds no funds.
4. Display names are resolved off-chain from the registry token's `tokenURI`
   metadata. The contract never stores names.

## Reward-receiving address

TBD — zhao to provide (his wallet, USDC on BSC).

## Submission checklist (PLAN §3.7)

- [x] Contract deployed on BSC mainnet, source verified via Sourcify exact match, repo public — https://github.com/canglvam/agentboard
- [x] Frontend live (GitHub Pages) — https://canglvam.github.io/agentboard/ — core features still to be tested with a real Agentic Wallet
- [ ] BscScan native verification still needs a free API key (Cloudflare Turnstile blocks cloud + device browser automation; user to create key on own computer)
- [ ] Submission materials complete (name, site, contracts, Agent ID usage, reward address)
- [ ] Submission form link verified (open item: no form URL in the announcement body as crawled 2026-11-18, re-checked 22:40 JST 2026-11-18 — still no project form link, only the community survey link; re-check announcement page + @BinanceWallet before Dec 5) and submitted **by Dec 8**
- [ ] ≥30 Agent ID addresses interacted (verified from contract events on BscScan) — 0 interactions as of 2026-11-18 22:40 JST (latest block 134320980, 0 logs to contract since deploy block 134312023)
- [ ] Red-line checklist signed off in `docs/AUDIT-NOTES.md`
- [ ] Demo video (≤2 min: connect → check-in → badge → tip → leaderboard)
- [ ] Community award: separate X post with `#BinanceWalletHackathon` + `#AgenticWallet`, link submitted via official survey

## Notes

- **zhao already holds an Agent ID — CONFIRMED on-chain 2026-11-18:** `canglvam.ai`, Agentic Wallet `0x3424ed37Fa7AE383e2410583B667fFc541daee9d`. Verified independently via BSC mainnet RPC: `balanceOf` on the Agent ID registry = 1; tokenId = `keccak256("canglvam")` = `0xe07780afaadba0d1e5035e2b1fddf1e1976f59c21dd114376baeadcff15651f6`, `ownerOf(tokenId)` = the wallet above; `tokenURI` = `https://agentid.prd.space.id/metadata/canglvam.json` (metadata name `canglvam`, "Binance Agent Id"). No claim step needed. This address is the reference wallet for the live mainnet test (planned Nov 24).
- **Name resolution — VALIDATED:** forward `.ai` → address works fully on-chain (`ownerOf(keccak256(label))`); the frontend uses it for the tip box on mainnet. Reverse (address → name) has no public on-chain path: the registry is not enumerable (`tokenOfOwnerByIndex` reverts) and the SPACE ID Web3 Name SDK v0.4.2 returns null for `.ai` — the leaderboard therefore shows truncated addresses unless the connected user verifies their own name in-browser (on-chain ownership check, localStorage only). See `docs/AUDIT-NOTES.md`.
- **Testnet deployer (fresh, mode 600):** `0xcA94e3aF3229abf7612a12c8Ffa99fC6F695BCFe` — balance 0 tBNB on 2026-11-18; testnet deploy is BLOCKED until it is funded (see below).
- **Mainnet deployer (fresh, mode 600):** `0x179c14c0A2281cEBc4570e008F870AA7C700EeD1` — FUNDED 0.02099 BNB by zhao 2026-11-18; deployed AgentBoard, remaining balance 0.02088098 BNB after deploy.
- **Testnet funding blocker:** the official BSC testnet faucet needs a captcha + 0.002 BNB on BSC mainnet in the receiving address, and I (a background agent) cannot use a browser. Options: (a) zhao claims 0.3 tBNB from https://testnet.bnbchain.org/faucet-smart to his own wallet (which already holds mainnet BNB) and sends ~0.1 tBNB to the testnet deployer above; (b) the parent agent runs a browser task for the faucet claim. Until then, testnet deploy + E2E are ready to run but unfunded.
