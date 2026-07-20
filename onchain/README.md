# Velora — On-Chain Module (Robinhood Chain)

The smart-contract layer that turns the Velora AI trading desk (this repo) into a
product other people can use **and verify**: a non-custodial, AI-managed vault for
tokenized real-world assets (Robinhood Chain **Stock Tokens**) where the risk rules
in [`../CLAUDE.md`](../CLAUDE.md) and [`../strategies/README.md`](../strategies/README.md)
are **enforced by the contract, not merely promised by a prompt** — and every desk
run leaves a tamper-proof track record.

> **Status: testnet / preview.** Built and tested end-to-end locally (76 passing
> tests + a live anvil deploy). The periphery (USDG, Stock Token, price oracle, swap
> adapter) is **mocked** for the demo; a production deploy points the vault at real
> Robinhood Chain addresses. **Not audited. Do not use with real funds.**

---

## Why this exists

The desk already has the hard part — analysts + a Risk Manager + written strategies.
What retail can't do today is *trust* an AI with money: robo-advisors are custodial
black boxes, and "AI trading bots" all claim profits nobody can check. This module
closes both gaps on-chain:

1. **Guardrails as code** — the CLAUDE.md caps become a smart contract an agent
   *cannot* bypass, only the human owner can change.
2. **Proof-of-track-record** — each desk run is attested on-chain; performance is
   computed from attested data, so it can't be inflated.

## Architecture (6 contracts)

```
GuardrailConfig ──caps──►  Guardrails (pure lib)
 (human-owned,                    ▲  evaluate(order)
  fail-closed)                    │
                          RWAVault (ERC-4626)  ◄──manager── SessionKeyExecutor
                          enforces caps at              (expiring, revocable,
                          the custody layer              scoped agent keys)
                           │    ▲                            ▲
              deposit/     │    │ previewTrade / redeemInKind│ trade()
              withdraw ────┘    └──────────────┐             │
                                               │        VeloraAutosave
DeskRegistry ──series──► PerfScore             │        (recurring DCA,
 (append-only,           (return / drawdown /  │         non-custodial)
  chain-stamped)          volatility / Sharpe) │
```

| Contract | Role | File |
|---|---|---|
| `Guardrails` | Pure library: the CLAUDE.md rulebook as a deterministic `evaluate()` | [src/libraries/Guardrails.sol](src/libraries/Guardrails.sol) |
| `GuardrailConfig` | Human-owned, fail-closed store of the caps (agent can't change) | [src/GuardrailConfig.sol](src/GuardrailConfig.sol) |
| `RWAVault` | ERC-4626 vault; enforces guardrails on every trade at the custody layer | [src/RWAVault.sol](src/RWAVault.sol) |
| `SessionKeyExecutor` | ERC-4337-style scoped/expiring/revocable delegation to agent keys | [src/SessionKeyExecutor.sol](src/SessionKeyExecutor.sol) |
| `VeloraAutosave` | Consumer recurring DCA into the vault (keeper-triggered) | [src/VeloraAutosave.sol](src/VeloraAutosave.sol) |
| `DeskRegistry` + `PerfScore` | Attested track record + on-chain performance math | [src/DeskRegistry.sol](src/DeskRegistry.sol) · [src/PerfScore.sol](src/PerfScore.sol) |

## CLAUDE.md → on-chain mapping

Every cap in [`../strategies/README.md`](../strategies/README.md) is basis-pointed and enforced:

| Rule | Value | On-chain |
|---|---|---|
| Per-trade cap | 15% NAV | `perTradeBps 1500` — blocks the buy |
| Max concentration | 25% NAV | `maxConcentrationBps 2500` |
| Max open positions | 6 | `maxOpenPositions` |
| Max daily orders | 4 | `maxDailyOrders` (buys throttled; sells never trapped) |
| Stop-loss required | −8% | `stopLossBps 800` (buy reverts without a real stop) |
| Daily-loss halt | −5% | `dailyLossHaltBps 500` (live + latchable) |
| Cash buffer | ≥10% | `cashBufferBps 1000` |
| No averaging into losers | except left-side ladder | `leftSideException` flag |

The vault re-checks these on **every** `executeTrade`, so a compromised agent key
(or a buggy strategy) can't push an order the rules forbid. `previewTrade(order)`
returns the exact `Violation` before anything is signed — the on-chain analogue of
CLAUDE.md's "present a preview, then get approval".

## Security model — defense in depth

- **Layer 1 — SessionKeyExecutor:** per-agent scope (expiry, per-trade + cumulative
  notional caps, max trades, token allowlist, side). Revocable instantly. A trade the
  vault rejects consumes *none* of the session budget.
- **Layer 2 — RWAVault + GuardrailConfig:** the hard, non-bypassable risk caps at the
  custody layer.
- **Human-only caps:** only `GuardrailConfig.owner` can change limits; the agent has
  read access and nothing more.
- **Always-solvent exit:** `redeemInKind` returns a pro-rata slice of USDG + every
  Stock Token; it can never fail for lack of cash.

---

## Build & test

```bash
cd onchain
forge test            # 76 tests across 6 suites
forge test --gas-report
```

Dependencies (`forge-std`, OpenZeppelin v5.1.0) are vendored plainly under `lib/`
(no submodules) so a fresh clone builds offline.

## Deploy

```bash
# Local simulation (prints all addresses, seeds a live demo):
forge script script/Deploy.s.sol

# Robinhood Chain testnet:
export RH_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com   # confirm in docs
forge script script/Deploy.s.sol \
  --rpc-url $RH_TESTNET_RPC --broadcast --private-key $PRIVATE_KEY
```

The script deploys + wires all six contracts, seeds a demo (deposit, one
guardrail-checked trade, two attestations), and writes addresses to
`deployments/latest.json`.

**Going to production:** replace the demo periphery in `script/Deploy.s.sol` with real
Robinhood Chain addresses — USDG (Paxos), a Chainlink-backed oracle adapter, a
Uniswap/Pleiades swap adapter, and real Stock Tokens. In production the agent key
should be an **ERC-4337 session key** on the desk's smart account (Robinhood Chain has
first-class ERC-4337 support), with `SessionKeyExecutor` as the vault manager.

## Bridge — light up the dashboard

The existing UI already renders an `onchain` panel set. The bridge fills it with live
contract state (and can attest a desk run):

```bash
cd bridge && npm install
RPC_URL=$RH_TESTNET_RPC node index.mjs                     # refresh onchain block
RPC_URL=$RH_TESTNET_RPC PRIVATE_KEY=0x.. node index.mjs --attest   # + attest a run
```

It reads `deployments/latest.json`, pulls NAV / shares / caps / attestations /
PerfScore, and writes the `onchain` block into `../ui/public/desk-state.json` (the
gitignored live file). Run `cd ../ui && npm run dev` to see the panels.

---

## ⚠️ Robinhood Chain realities (verify before mainnet)

From research (July 2026 — Robinhood Chain mainnet went live 2026-07-01):

- **Stock Tokens are not for US persons** — restricted in the US, UK, Canada,
  Switzerland, UAE, and sanctioned jurisdictions; available in 120+ countries. A US
  person likely **cannot hold Stock Tokens on mainnet**. You can still develop/deploy
  on **testnet** (chain id ~46630) regardless, and build for a non-US audience.
- **Stock Tokens ≠ share ownership** — they are price-tracking instruments issued by a
  Robinhood entity; no voting rights, and holders are creditors if the issuer fails.
- **Centralized today** — single sequencer run by Robinhood, which also issues the
  asset. Possible transfer restrictions/allowlists on Stock Tokens mean the vault may
  need to be an allowlisted contract — confirm at <https://docs.robinhood.com/chain>.
- Chain is EVM-compatible (Arbitrum Orbit, ETH gas); DeFi live day-one: Uniswap +
  Pleiades (AMM), Morpho (lending), Lighter (perps), Chainlink (oracles), USDG (Paxos).

## Roadmap

- Real Chainlink oracle adapter + Uniswap/Pleiades swap adapter (replace mocks).
- ERC-4337 account + on-chain session-key validation (native, not just this executor).
- EAS-schema attestations + a soulbound reputation token wrapping `PerfScore`.
- Morpho integration for the RWA-collateralized lending product.
- Audit before any real funds.
