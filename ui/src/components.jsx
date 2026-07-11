import { useState } from 'react'
import { usd, pct, num, signClass, timeAgo } from './format.js'

/* ---------- run trigger (button → desk-request.json, dev server only) ---------- */

export function RunControls() {
  const [tickers, setTickers] = useState('')
  const [copied, setCopied] = useState(false)

  const promptText = () => {
    const list = tickers.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    return list.length
      ? `Run the desk on ${list.join(', ')} — read-only, stop at the preview card.`
      : 'Run the desk: screen my watchlist for left-side value candidates — read-only, stop at the preview card.'
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptText())
      setCopied(true)
      setTimeout(() => setCopied(false), 4000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="panel runbar">
      <div className="runbar-row">
        <input
          className="run-input"
          placeholder="tickers e.g. AAPL, NVDA  (blank = screen the watchlist)"
          value={tickers}
          onChange={(e) => setTickers(e.target.value)}
        />
        <button className="run-btn" onClick={copyPrompt}>⧉ Copy run prompt</button>
      </div>
      <div className="run-status">
        {copied
          ? <span className="pos">✓ Copied — paste it into your Claude Code session to run the desk.</span>
          : <span className="dim">The desk runs inside your Claude Code session (read-only — it stops at the preview card, never places orders). Copy this and paste it there:</span>}
        <div className="run-prompt-preview">{promptText()}</div>
      </div>
    </section>
  )
}

/* ---------- shared bits ---------- */

export function DecisionBadge({ decision }) {
  const map = {
    APPROVE: 'badge approve',
    'APPROVE-WITH-CHANGES': 'badge changes',
    VETO: 'badge veto',
    PENDING_APPROVAL: 'badge pending',
  }
  const label = (decision || '').replace(/_/g, ' ')
  return <span className={map[decision] || 'badge'}>{label || '—'}</span>
}

function ScoreChip({ value, label }) {
  // value -2..+2
  const cls = value > 0 ? 'chip pos' : value < 0 ? 'chip neg' : 'chip flat'
  const sign = value > 0 ? `+${value}` : `${value}`
  return (
    <span className={cls} title={`${label}: ${sign}`}>
      <em>{label}</em> {sign}
    </span>
  )
}

/* ---------- account header ---------- */

export function AccountHeader({ account, generatedAt }) {
  const a = account || {}
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">▰▰</span>
        <div>
          <div className="brand-title">RH Agentic Desk</div>
          <div className="brand-sub">
            <span className={`dot ${a.connected ? 'on' : 'off'}`} />
            {a.name || 'Agentic account'} · {a.connected ? 'connected' : 'disconnected'}
          </div>
        </div>
      </div>

      <div className="topstats">
        <Stat label="Equity" value={usd(a.equity)} />
        <Stat label="Day P&L" value={`${usd(a.dayPnl)} (${pct(a.dayPnlPct)})`} cls={signClass(a.dayPnl)} />
        <Stat label="Buying power" value={usd(a.buyingPower)} />
        <Stat label="Cash" value={usd(a.cash)} />
        <Stat label="Positions" value={`${num(a.openPositions)}`} />
        <Stat label="Orders today" value={`${num(a.ordersToday)}`} />
      </div>

      <div className="asof">as of {timeAgo(generatedAt)}</div>
    </header>
  )
}

function Stat({ label, value, cls = '' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls}`}>{value}</div>
    </div>
  )
}

/* ---------- risk caps panel ---------- */

export function RiskPanel({ caps, account, positions }) {
  if (!caps) return null
  const equity = account?.equity || 0
  const maxWeight = Math.max(0, ...(positions || []).map((p) => p.weightPct || 0))
  const cashPct = equity ? ((account?.cash || 0) / equity) * 100 : 0

  const rows = [
    { label: 'Per-trade cap', limit: `${caps.perTradePct}%`, bar: null },
    { label: 'Top position concentration', used: maxWeight, limit: caps.maxConcentrationPct, unit: '%' },
    { label: 'Open positions', used: account?.openPositions || 0, limit: caps.maxOpenPositions, unit: '' },
    { label: 'Orders today', used: account?.ordersToday || 0, limit: caps.maxDailyOrders, unit: '' },
    { label: 'Cash buffer (min)', used: cashPct, limit: caps.cashBufferPct, unit: '%', invert: true },
    { label: 'Day loss halt', used: Math.max(0, -(account?.dayPnlPct || 0)), limit: caps.dailyLossHaltPct, unit: '%' },
  ]

  return (
    <section className="panel">
      <h2>Risk Limits</h2>
      <div className="risk-rows">
        {rows.map((r) => {
          if (r.bar === null) {
            return (
              <div className="risk-row" key={r.label}>
                <span className="risk-name">{r.label}</span>
                <span className="risk-num">{r.limit}</span>
              </div>
            )
          }
          const ratio = r.limit ? Math.min(1, r.used / r.limit) : 0
          // for cash buffer (invert), being BELOW the limit is the breach
          const breach = r.invert ? r.used < r.limit : r.used >= r.limit
          const warn = !breach && ratio >= 0.8
          return (
            <div className="risk-row" key={r.label}>
              <span className="risk-name">{r.label}</span>
              <div className="meter">
                <div
                  className={`meter-fill ${breach ? 'breach' : warn ? 'warn' : 'ok'}`}
                  style={{ width: `${Math.max(4, ratio * 100)}%` }}
                />
              </div>
              <span className={`risk-num ${breach ? 'neg' : ''}`}>
                {r.unit === '%' ? `${r.used.toFixed(1)}/${r.limit}%` : `${r.used}/${r.limit}`}
              </span>
            </div>
          )
        })}
      </div>
      <div className="risk-foot">No averaging into losers · stop-loss required on every entry</div>
    </section>
  )
}

/* ---------- positions ---------- */

export function Positions({ positions }) {
  return (
    <section className="panel">
      <h2>Positions <span className="count">{positions?.length || 0}</span></h2>
      <table className="grid">
        <thead>
          <tr>
            <th>Symbol</th><th className="r">Qty</th><th className="r">Avg</th>
            <th className="r">Last</th><th className="r">Value</th>
            <th className="r">P&L</th><th className="r">Weight</th><th className="r">Stop</th>
          </tr>
        </thead>
        <tbody>
          {(positions || []).map((p) => (
            <tr key={p.symbol}>
              <td className="sym">{p.symbol}</td>
              <td className="r">{num(p.qty)}</td>
              <td className="r mono">{usd(p.avgCost)}</td>
              <td className="r mono">{usd(p.last)}</td>
              <td className="r mono">{usd(p.value)}</td>
              <td className={`r mono ${signClass(p.pnl)}`}>{usd(p.pnl)} <small>({pct(p.pnlPct)})</small></td>
              <td className="r mono">{p.weightPct?.toFixed(1)}%</td>
              <td className="r mono dim">{usd(p.stop)}</td>
            </tr>
          ))}
          {(!positions || positions.length === 0) && (
            <tr><td colSpan="8" className="empty">No open positions</td></tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

/* ---------- candidates / desk analysis ---------- */

export function Candidates({ candidates }) {
  return (
    <section className="panel">
      <h2>Desk Analysis <span className="count">{candidates?.length || 0}</span></h2>
      <div className="cards">
        {(candidates || []).map((c) => (
          <article className="cand" key={c.symbol}>
            <div className="cand-head">
              <span className="sym lg">{c.symbol}</span>
              <span className="tag">{c.strategy}</span>
              <DecisionBadge decision={c.risk?.decision} />
            </div>

            <div className="verdicts">
              <Verdict role="Fundamental" score={c.fundamental?.score} conf={c.fundamental?.confidence} note={c.fundamental?.note} />
              <Verdict role="Technical" score={c.technical?.signal} conf={c.technical?.confidence} note={c.technical?.note} />
              <Verdict role="Macro/News" sentiment={c.macro?.sentiment} conf={null} note={c.macro?.note} injection={c.macro?.injection} />
            </div>

            {c.technical?.entry != null && (
              <div className="levels">
                <span>entry <b>{usd(c.technical.entry)}</b></span>
                <span>stop <b>{usd(c.technical.stop)}</b></span>
                <span>sup {usd(c.technical.support)}</span>
                <span>res {usd(c.technical.resistance)}</span>
              </div>
            )}

            <div className="risk-note">
              <b>Risk:</b> {c.risk?.note}
            </div>
          </article>
        ))}
        {(!candidates || candidates.length === 0) && <div className="empty">No candidates analyzed yet</div>}
      </div>
    </section>
  )
}

function Verdict({ role, score, sentiment, conf, note, injection }) {
  let chip
  if (sentiment != null) {
    const cls = sentiment === 'positive' ? 'pos' : sentiment === 'negative' ? 'neg' : 'flat'
    chip = <span className={`chip ${cls}`}><em>{role}</em> {sentiment}</span>
  } else {
    const cls = score > 0 ? 'pos' : score < 0 ? 'neg' : 'flat'
    const s = score > 0 ? `+${score}` : `${score}`
    chip = <span className={`chip ${cls}`}><em>{role}</em> {s}</span>
  }
  return (
    <div className="verdict" title={note}>
      {chip}
      {conf && <span className="conf">{conf}</span>}
      {injection && injection !== 'none' && <span className="chip neg" title="prompt-injection flag">⚠ inj</span>}
      <p className="vnote">{note}</p>
    </div>
  )
}

/* ---------- proposed trade / preview card ---------- */

export function ProposedTrade({ trade }) {
  if (!trade) {
    return (
      <section className="panel preview empty-preview">
        <h2>Order Preview</h2>
        <div className="empty">No trade proposed. Ask the PM to run the desk.</div>
      </section>
    )
  }
  const t = trade
  return (
    <section className="panel preview">
      <h2>Order Preview <DecisionBadge decision={t.status} /></h2>
      <div className="preview-line">
        <span className={`side ${t.side}`}>{t.side?.toUpperCase()}</span>
        <span className="sym lg">{t.symbol}</span>
        <span className="qty">{num(t.qty)} sh</span>
        <span className="otype">{t.orderType}{t.limitPrice ? ` @ ${usd(t.limitPrice)}` : ''}</span>
      </div>

      <div className="preview-grid">
        <Cell k="Est. cost" v={usd(t.estCost)} />
        <Cell k="Weight after" v={`${t.weightAfterPct?.toFixed(1)}%`} />
        <Cell k="Stop" v={`${usd(t.stop)} (${pct(t.stopPct)})`} />
        <Cell k="Strategy" v={t.strategy} />
        <Cell k="Risk" v={<DecisionBadge decision={t.riskDecision} />} />
      </div>

      <p className="rationale">{t.rationale}</p>

      <div className="approve-bar">
        <div className="approve-note">
          ⏸ Approval happens in the Claude Code session — the desk never auto-places orders.
        </div>
        <div className="approve-btns">
          <button className="btn ghost" disabled>Reject</button>
          <button className="btn primary" disabled>Approve in session →</button>
        </div>
      </div>
    </section>
  )
}

function Cell({ k, v }) {
  return (
    <div className="cell">
      <div className="cell-k">{k}</div>
      <div className="cell-v">{v}</div>
    </div>
  )
}

/* ---------- activity + injection ---------- */

export function ActivityLog({ orders }) {
  return (
    <section className="panel">
      <h2>Recent Orders</h2>
      <ul className="log">
        {(orders || []).map((o, i) => (
          <li key={i}>
            <span className={`side ${o.side}`}>{o.side}</span>
            <span className="sym">{o.symbol}</span>
            <span className="mono">{num(o.qty)} @ {usd(o.price)}</span>
            <span className={`ostatus ${o.status}`}>{o.status}</span>
            <span className="dim">{timeAgo(o.time)}</span>
          </li>
        ))}
        {(!orders || orders.length === 0) && <li className="empty">No orders yet</li>}
      </ul>
    </section>
  )
}

export function InjectionAlerts({ alerts }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <section className="panel alert">
      <h2>⚠ Prompt-Injection Alerts <span className="count">{alerts.length}</span></h2>
      {alerts.map((a, i) => (
        <div className="inj" key={i}>
          <div className="inj-quote">“{a.quote}”</div>
          <div className="inj-meta">
            <span className="dim">{a.source}</span> · handled by {a.handledBy} · <b>{a.action}</b>
          </div>
        </div>
      ))}
    </section>
  )
}
