# AgentBoard — Audit Notes & Red-Line Checklist

Updated: 2026-11-18 (JST). Status: testnet build in progress; mainnet pending.

## Owner powers (disclosed, per hackathon rules)

- Contract owner = deployer address.
- The ONLY owner functions are `pause()` and `unpause()` (emergency stop).
- There is **no** `withdraw`, no fee setter, no mint-to-owner, no freeze,
  no tax, no pause-trading function. Tips forward 100% of `msg.value`
  immediately via a low-level call; the contract balance is 0 after every tip.
- Constructor takes the Agent ID registry address as a parameter (real
  registry on mainnet, mock on testnet).

## Red-line checklist (hackathon announcement — any violation = disqualification)

| # | Rule | Status / evidence |
|---|---|---|
| 1 | No web QR-code login / pairing codes on third-party sites | PASS by design — standard injected-wallet connect only; no QR flow anywhere in the frontend. |
| 2 | No storing login sessions server-side to trade for users | PASS — no backend, no server, no sessions. Static page + public RPC only. |
| 3 | No prompts that bypass user tx confirmation | PASS — every action is a user-signed transaction; the UI shows the exact action/amount before signing. |
| 4 | No unauthorized transfers (scheduled collection, bundled extra transfers, silent unlimited approvals) | PASS — `tip()` transfers exactly `msg.value` to exactly the recipient shown; no approvals are ever requested. |
| 5 | Contract open-source, owner permissions disclosed | PASS (in progress) — MIT repo, this file, README; BscScan verification required before submission. |
| 6 | No using "Binance"/"BNB" in project/token/domain names | PASS — project is "AgentBoard", badge token "AgentBoard Badge" (ABDG). "BNB Smart Chain" is used only as the factual network name in UI/docs. |
| 7 | No collecting seed phrases / private keys / API secrets / pairing codes | PASS — the UI never asks for any credential; wallet connection is read-only until the user signs. |
| 8 | No promising returns ("passive income", "automatic money-making") | PASS — no returns language anywhere; check-ins and badges are free and explicitly non-monetary. |
| 9 | Trading products must show a risk warning | N/A (not a trading product) — tips show a "voluntary and non-refundable" warning anyway. |
| 10 | Agent ID must not be packaged as a wallet-lookup-by-name tool | PASS — names are shown only for the connected wallet (after an on-chain ownership check: `ownerOf(keccak256(label)) === connected address`) and for leaderboard addresses whose name was verified in this browser. No public name→address search: the tip box resolves a typed `.ai` name to an address only so the user can tip that specific person, and the contract then verifies the recipient holds an Agent ID. Forward resolution is pure on-chain (`ownerOf(keccak256(label))`, validated against `canglvam.ai` on mainnet 2026-11-18). |
| 11 | No abnormal behaviour / mass fake-account interactions | To be honoured in acquisition — only real Agent ID holders, no bots, no bought interactions. |

## Test results

### Local Hardhat tests — 12/12 PASS (2026-11-18, Node 22, Hardhat 2.22, solc 0.8.30, evmVersion cancun)

- Command: `npx hardhat test`
- Result: **12 passing, 0 failing** (compiled 24 Solidity files successfully).
- Coverage: deployment wiring + zero contract balance; `hasAgentId` true/false; `checkIn` reverts without ID; 1 check-in/day; streak increments on consecutive days; streak resets after a missed day; badge mints exactly one per holder with on-chain SVG metadata; badge reverts without ID; tip forwards 100% (event + balance assertions) and reverts for zero value / non-holder sender / non-holder recipient / >280-char message; pause blocks actions and only the owner can pause/unpause; `getStats` returns streak/totals/last day/badge flag.
- Build fixes made along the way: OZ Contracts 5.6.1 needs `evmVersion: "cancun"` (MCOPY opcode; Hardhat defaults to Paris) and solc 0.8.30; the tip test had to split `.emit` and `.changeEtherBalance` into separate expects (chai matchers cannot chain them).

### BSC testnet E2E — BLOCKED ON FAUCET (not run)

- Command: `npx hardhat run scripts/e2e-testnet.js --network bscTestnet`
- Result: **not run — deployer has 0 tBNB.** Deploy script refuses cleanly: `Error: Deployer balance too low (< 0.005 BNB). Fund 0xcA94e3aF3229abf7612a12c8Ffa99fC6F695BCFe first.` (verified 2026-11-18 via BSC testnet RPC: balance `0x0`).
- The E2E script is ready: funds 3 fresh test wallets, mints mock IDs (alice.ai / bob.ai / carol.ai), runs checkIn x3, claimBadge x3, tip 100% forwarding, event reads and stats checks, and writes `deployments/bscTestnet-e2e.json`.

### Frontend smoke test — PASS (2026-11-18)

- Served `frontend/` locally; `index.html`, `app.js`, `style.css`, `config.js` all return HTTP 200. `node --check` passes on all JS files. Full browser flow (connect → check-in → badge → tip) awaits the testnet deployment.

### Name-resolution validation — mainnet, live RPC (2026-11-18)

- `balanceOf(0x3424ed37Fa7AE383e2410583B667fFc541daee9d)` on the real registry = **1** (independent re-check; matches the parent's verification).
- `tokenOfOwnerByIndex` **reverts** on the real registry — it is not enumerable. The frontend handles this with try/catch.
- `keccak256("canglvam")` → tokenId `0xe07780af…51f6`; `ownerOf(tokenId)` = zhao's wallet **(match)**.
- `tokenURI(tokenId)` = `https://agentid.prd.space.id/metadata/canglvam.json`; metadata name `canglvam`, description "Binance Agent Id". Forward resolution is therefore fully on-chain with no API dependency.
- SPACE ID Web3 Name SDK v0.4.2 (`@web3-name-sdk/core`): `getAddress("canglvam.ai")`, `getDomainName({address, queryChainIdList:[56]})` and `getMetadata` all return **null/undefined**, even with a working BSC RPC (its default public RPCs are dead — Ankr demo key 401). The SDK predates the `.ai` TLD and is NOT used.
- Reverse lookup (address → name) has no public path for `.ai`; the frontend falls back to a user-verified name (on-chain ownership check, localStorage) or a truncated address.

## Open items / known unknowns

1. **Submission form URL** — not in the announcement body as crawled 2026-11-18. Re-check the announcement page + @BinanceWallet before Dec 5; submit by Dec 8.
2. **Agentic Wallet connect UX** — untested: whether the Agentic Wallet address can connect to a third-party dApp via injected provider/WalletConnect, or whether the check-in must be sent from the Binance app's built-in browser. Live test with zhao's real wallet planned Nov 24. Reference wallet: `canglvam.ai` / `0x3424ed37Fa7AE383e2410583B667fFc541daee9d` (holding verified on-chain 2026-11-18).
3. **Reverse name lookup** — no public path for `.ai` (registry not enumerable; SDK v0.4.2 returns null). Frontend falls back to user-verified names / truncated addresses. Forward resolution (`.ai` → address) is validated on-chain and used by the tip box on mainnet.
4. **BSC testnet faucet — BLOCKING testnet deploy.** Official faucet (https://testnet.bnbchain.org/faucet-smart) needs a captcha + 0.002 BNB on BSC mainnet in the receiving address; QuickNode needs mainnet ETH; Chainstack needs an API key + mainnet ETH; Crypto Chief needs an account login. The testnet deployer `0xcA94e3aF3229abf7612a12c8Ffa99fC6F695BCFe` holds 0 tBNB. Unblock options: (a) zhao claims 0.3 tBNB to his own wallet and forwards ~0.1 tBNB to the testnet deployer; (b) parent agent runs a browser task for the faucet claim. Testnet deploy + E2E are fully scripted and ready to run the moment funding lands.
5. **BNB Chain "Jenner" hard fork** — scheduled Dec 8, 2026 02:30 UTC; changes block-capacity rules, not fees. Avoid deploying in the hours around it (mainnet deploy is planned Nov 24, well clear).
6. **BscScan API from this VM** — `api.bscscan.com` is Cloudflare-gated from curl and the Etherscan V2 free tier does not cover BSC, so tokenId discovery for arbitrary holders was done via on-chain calls instead (validated for `canglvam.ai`). BscScan source verification will use a free API key at deploy time; if the key flow is blocked, verification can also be done via the BscScan website form.
