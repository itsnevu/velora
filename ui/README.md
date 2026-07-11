# Trading Desk UI

A read-only, professional dashboard for the Robinhood Agentic desk. It is a **mirror**,
not a controller: it visualizes a `desk-state.json` snapshot the PM session writes after
each desk run. **It cannot place orders** — approval and execution happen only in the
Claude Code session (per `CLAUDE.md`).

## Run

```bash
cd ui
npm install
npm run dev          # opens http://localhost:5180
```

A demo `public/desk-state.example.json` ships so the UI looks alive immediately.

## How data flows

```
Claude Code (PM) ── runs the desk, writes ──▶ ui/public/desk-state.json ──▶ UI polls every 5s
                                              (gitignored: real account state)
```

The app fetches `desk-state.json` first and **falls back to `desk-state.example.json`**
when it is absent — so a fresh clone renders the demo, while your real run renders live.
`desk-state.json` is **gitignored** (it holds real balances/positions) and is never
committed; only the sanitized example is. The UI cache-busts each poll, so writes show
up within ~5s without a reload.

Tell the PM to write the snapshot, e.g.:
> "After the desk run, write the state to ui/public/desk-state.json."

## `desk-state.json` schema

```jsonc
{
  "generatedAt": "ISO-8601",            // timestamp shown in the header
  "account": {
    "name": "Robinhood Agentic", "connected": true,
    "equity": 0, "cash": 0, "buyingPower": 0,
    "dayPnl": 0, "dayPnlPct": 0, "openPositions": 0, "ordersToday": 0
  },
  "riskCaps": {                          // mirrors strategies/README.md
    "perTradePct": 15, "maxConcentrationPct": 25, "maxOpenPositions": 6,
    "maxDailyOrders": 4, "stopLossPct": 8, "dailyLossHaltPct": 5, "cashBufferPct": 10
  },
  "positions": [
    { "symbol": "AAPL", "qty": 10, "avgCost": 0, "last": 0,
      "value": 0, "pnl": 0, "pnlPct": 0, "weightPct": 0, "stop": 0 }
  ],
  "candidates": [                        // one per analyzed ticker
    { "symbol": "MSFT", "strategy": "mean-reversion",
      "fundamental": { "score": -2..2, "confidence": "low|med|high", "valuation": "", "growth": "", "note": "" },
      "technical":   { "signal": -2..2, "confidence": "", "trend": "", "support": 0, "resistance": 0, "entry": 0, "stop": 0, "note": "" },
      "macro":       { "sentiment": "negative|mixed|positive", "backdrop": "", "injection": "none", "note": "" },
      "risk":        { "decision": "APPROVE|APPROVE-WITH-CHANGES|VETO", "sizingOk": true, "note": "" } }
  ],
  "proposedTrade": {                     // null if none pending
    "symbol": "MSFT", "side": "buy|sell", "qty": 0, "orderType": "limit|market",
    "limitPrice": 0, "estCost": 0, "weightAfterPct": 0, "stop": 0, "stopPct": 0,
    "strategy": "", "riskDecision": "", "status": "PENDING_APPROVAL", "rationale": "" },
  "recentOrders": [
    { "time": "ISO", "symbol": "", "side": "buy|sell", "qty": 0, "price": 0, "type": "", "status": "filled|pending|cancelled" }
  ],
  "injectionAlerts": [                   // from the macro-news analyst; [] if none
    { "source": "url", "quote": "verbatim suspicious text", "handledBy": "macro-news-analyst", "action": "ignored" }
  ]
}
```

The field names map 1:1 to the sub-agents' output blocks in `.claude/agents/` and the
caps in `strategies/README.md`, so the PM can fill it directly from a desk run.
