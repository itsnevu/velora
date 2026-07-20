import { useEffect, useState, useCallback } from 'react'
import {
  AccountHeader, RiskPanel, Positions, Candidates,
  ProposedTrade, ActivityLog, InjectionAlerts, RunControls,
  Backtests, DecisionTimeline, Eyebrow, PreviewBadge,
  NetworkBadge, VaultPanel, GuardrailsOnChain, TrackRecord, ExecutorPanel, AutosavePanel,
} from './components.jsx'

const POLL_MS = 5000

export default function App() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [lastLoad, setLastLoad] = useState(null)

  const load = useCallback(async () => {
    const fetchJson = async (path) => {
      // cache-bust so edits to the snapshot show up live
      const res = await fetch(`${path}?t=${Date.now()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }
    try {
      // live snapshot written by the PM (gitignored); fall back to the shipped sample
      let data
      try {
        data = await fetchJson('/desk-state.json')
      } catch {
        data = await fetchJson('/desk-state.example.json')
      }
      setState(data)
      setError(null)
      setLastLoad(new Date())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  if (!state && !error) {
    return <div className="loading">Loading desk state…</div>
  }
  if (!state && error) {
    return (
      <div className="loading err">
        Could not load <code>desk-state.json</code> — {error}
        <div className="hint">The PM session writes it; a sample ships in <code>public/</code>.</div>
      </div>
    )
  }

  const onchain = state.onchain

  return (
    <div className="app">
      <AccountHeader account={state.account} generatedAt={state.generatedAt} />

      {error && <div className="stale">⚠ Live refresh failed ({error}); showing last good state.</div>}

      <div className="section-lead">
        <Eyebrow index="01">The desk · read-only mirror</Eyebrow>
        <span className="section-lead-rule" aria-hidden="true" />
      </div>

      <main className="layout">
        <div className="col-main">
          <RunControls />
          <ProposedTrade trade={state.proposedTrade} />
          {state.backtests && <Backtests backtests={state.backtests} />}
          <Candidates candidates={state.candidates} />
          <Positions positions={state.positions} />

          {onchain && (
            <div className="oc-band">
              <div className="oc-band-head">
                <Eyebrow index="02">On-chain · Robinhood Chain</Eyebrow>
                <div className="oc-band-tail">
                  <PreviewBadge />
                  <NetworkBadge network={onchain.network} />
                </div>
              </div>
              <VaultPanel vault={onchain.vault} network={onchain.network} />
              <GuardrailsOnChain guardrails={onchain.guardrails} />
              <TrackRecord trackRecord={onchain.trackRecord} />
            </div>
          )}

          <InjectionAlerts alerts={state.injectionAlerts} />
        </div>
        <aside className="col-side">
          <RiskPanel caps={state.riskCaps} account={state.account} positions={state.positions} />
          {onchain && <ExecutorPanel executor={onchain.executor} />}
          {onchain && <AutosavePanel autosave={onchain.autosave} />}
          <ActivityLog orders={state.recentOrders} />
          {state.decisionLog && <DecisionTimeline log={state.decisionLog} />}
        </aside>
      </main>

      <footer className="foot">
        Read-only mirror of the desk · refreshes every {POLL_MS / 1000}s · last {lastLoad?.toLocaleTimeString() || '—'}
        {' · '}orders are approved & placed only in the Claude Code session
      </footer>
    </div>
  )
}
