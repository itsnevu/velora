import React, { useCallback, useEffect, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
} from 'viem'

// ---- Robinhood Chain definitions (see onchain/DEPLOY.md) ----
const CHAINS = {
  46630: {
    id: 46630,
    name: 'Robinhood Chain Testnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com/rpc'] } },
    blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' } },
  },
  4663: {
    id: 4663,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
    blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.mainnet.chain.robinhood.com' } },
  },
  31337: {
    id: 31337,
    name: 'Anvil (local)',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  },
}

const VAULT_ABI = parseAbi([
  'function asset() view returns (address)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function convertToAssets(uint256) view returns (uint256)',
  'function maxWithdraw(address) view returns (uint256)',
  'function navUsdg() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function redeemInKind(uint256 shares, address receiver)',
])
const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])
const AUTOSAVE_ABI = parseAbi([
  'function createPlan(uint256 amountPerPeriod, uint64 period, uint32 totalPeriods)',
  'function cancelPlan()',
  'function due(address) view returns (bool)',
  'function plans(address) view returns (uint256 amountPerPeriod, uint64 period, uint64 nextExec, uint32 totalPeriods, uint32 periodsDone, bool active)',
])

const MAX_UINT = (2n ** 256n) - 1n

export default function VaultApp() {
  const [cfg, setCfg] = useState(null) // { chainId, contracts:{vault,autosave}, network }
  const [account, setAccount] = useState(null)
  const [pos, setPos] = useState(null) // resolved position/state
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')

  // deposit/withdraw/save form inputs
  const [depAmt, setDepAmt] = useState('')
  const [wdAmt, setWdAmt] = useState('')
  const [inkindShares, setInkindShares] = useState('')
  const [saveAmt, setSaveAmt] = useState('')
  const [savePeriodDays, setSavePeriodDays] = useState('7')
  const [savePeriods, setSavePeriods] = useState('0')

  // Load the deployed addresses from the bridge-written desk-state.json.
  useEffect(() => {
    async function boot() {
      try {
        let s
        try {
          s = await (await fetch('/desk-state.json', { cache: 'no-store' })).json()
        } catch {
          s = await (await fetch('/desk-state.example.json', { cache: 'no-store' })).json()
        }
        const oc = s.onchain
        if (!oc || !oc.contracts || !oc.contracts.vault) {
          setErr('No deployed vault found in desk-state.json — run the bridge after deploy.')
          return
        }
        setCfg({
          chainId: oc.network?.chainId ?? 31337,
          contracts: oc.contracts,
          network: oc.network,
        })
      } catch (e) {
        setErr('Could not read desk-state.json: ' + e.message)
      }
    }
    boot()
  }, [])

  const chain = cfg ? CHAINS[cfg.chainId] || CHAINS[31337] : null

  const publicClient = useCallback(() => {
    return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) })
  }, [chain])

  const walletClient = useCallback(() => {
    if (!window.ethereum) throw new Error('No injected wallet (install MetaMask).')
    return createWalletClient({ chain, transport: custom(window.ethereum) })
  }, [chain])

  const refresh = useCallback(
    async (acct) => {
      if (!cfg || !acct) return
      const pc = publicClient()
      const vault = cfg.contracts.vault
      const [symbol, vdec, asset, shares, nav, supply, maxWd] = await Promise.all([
        pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'symbol' }),
        pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'decimals' }),
        pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'asset' }),
        pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'balanceOf', args: [acct] }),
        pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'navUsdg' }),
        pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalSupply' }),
        pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'maxWithdraw', args: [acct] }),
      ])
      const [uDec, uSym, uBal, value] = await Promise.all([
        pc.readContract({ address: asset, abi: ERC20_ABI, functionName: 'decimals' }),
        pc.readContract({ address: asset, abi: ERC20_ABI, functionName: 'symbol' }),
        pc.readContract({ address: asset, abi: ERC20_ABI, functionName: 'balanceOf', args: [acct] }),
        pc.readContract({ address: vault, abi: VAULT_ABI, functionName: 'convertToAssets', args: [shares] }).catch(() => 0n),
      ])
      let plan = null
      if (cfg.contracts.autosave) {
        try {
          const p = await pc.readContract({ address: cfg.contracts.autosave, abi: AUTOSAVE_ABI, functionName: 'plans', args: [acct] })
          plan = { amountPerPeriod: p[0], period: p[1], nextExec: p[2], totalPeriods: p[3], periodsDone: p[4], active: p[5] }
        } catch { /* no plan */ }
      }
      setPos({ symbol, vdec, asset, shares, value, nav, supply, maxWd, uDec, uSym, uBal, plan })
    },
    [cfg, publicClient],
  )

  async function connect() {
    setErr('')
    try {
      const [acct] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      // Try to switch to the deployed chain.
      const hexId = '0x' + cfg.chainId.toString(16)
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
      } catch { /* user may be on the right chain already, or reject */ }
      setAccount(acct)
      await refresh(acct)
    } catch (e) {
      setErr(e.message)
    }
  }

  async function tx(run, label) {
    setBusy(true)
    setErr('')
    setStatus(label + '…')
    try {
      const hash = await run()
      setStatus(label + ' — confirming ' + hash.slice(0, 10) + '…')
      await publicClient().waitForTransactionReceipt({ hash })
      setStatus(label + ' ✓')
      await refresh(account)
    } catch (e) {
      setErr((e.shortMessage || e.message || 'failed').slice(0, 200))
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function ensureAllowance(spender, amount) {
    const pc = publicClient()
    const allowance = await pc.readContract({ address: pos.asset, abi: ERC20_ABI, functionName: 'allowance', args: [account, spender] })
    if (allowance >= amount) return
    const wc = walletClient()
    const hash = await wc.writeContract({ account, chain, address: pos.asset, abi: ERC20_ABI, functionName: 'approve', args: [spender, MAX_UINT] })
    await pc.waitForTransactionReceipt({ hash })
  }

  function doDeposit() {
    const amount = parseUnits(depAmt || '0', pos.uDec)
    if (amount <= 0n) return
    tx(async () => {
      await ensureAllowance(cfg.contracts.vault, amount)
      return walletClient().writeContract({ account, chain, address: cfg.contracts.vault, abi: VAULT_ABI, functionName: 'deposit', args: [amount, account] })
    }, `Deposit ${depAmt} ${pos.uSym}`)
  }

  function doWithdraw() {
    const amount = parseUnits(wdAmt || '0', pos.uDec)
    if (amount <= 0n) return
    tx(() => walletClient().writeContract({ account, chain, address: cfg.contracts.vault, abi: VAULT_ABI, functionName: 'withdraw', args: [amount, account, account] }),
      `Withdraw ${wdAmt} ${pos.uSym}`)
  }

  function doRedeemInKind() {
    const shares = parseUnits(inkindShares || '0', pos.vdec)
    if (shares <= 0n) return
    tx(() => walletClient().writeContract({ account, chain, address: cfg.contracts.vault, abi: VAULT_ABI, functionName: 'redeemInKind', args: [shares, account] }),
      `Redeem ${inkindShares} shares in-kind`)
  }

  function doCreatePlan() {
    const amount = parseUnits(saveAmt || '0', pos.uDec)
    const period = BigInt(Math.max(1, Math.round(Number(savePeriodDays) * 86400)))
    const total = Number(savePeriods) || 0
    if (amount <= 0n) return
    tx(async () => {
      await ensureAllowance(cfg.contracts.autosave, MAX_UINT)
      return walletClient().writeContract({ account, chain, address: cfg.contracts.autosave, abi: AUTOSAVE_ABI, functionName: 'createPlan', args: [amount, period, total] })
    }, `Create autosave plan`)
  }

  function doCancelPlan() {
    tx(() => walletClient().writeContract({ account, chain, address: cfg.contracts.autosave, abi: AUTOSAVE_ABI, functionName: 'cancelPlan', args: [] }),
      `Cancel autosave plan`)
  }

  // ---- render ----
  const fmt = (v, d, p = 2) => (v == null ? '—' : Number(formatUnits(v, d)).toLocaleString(undefined, { maximumFractionDigits: p }))

  return (
    <div className="vx-wrap">
      <style>{CSS}</style>
      <header className="vx-head">
        <div className="vx-brand">Velora <span>Vault</span></div>
        <div className="vx-net">{cfg ? (chain?.name || `chain ${cfg.chainId}`) : 'loading…'} · testnet preview</div>
        {account ? (
          <div className="vx-acct">{account.slice(0, 6)}…{account.slice(-4)}</div>
        ) : (
          <button className="vx-btn" disabled={!cfg} onClick={connect}>Connect wallet</button>
        )}
      </header>

      {err && <div className="vx-err">{err}</div>}
      {status && <div className="vx-status">{status}</div>}

      {!account && (
        <div className="vx-hero">
          <h1>AI-managed vault for tokenized stocks</h1>
          <p>Deposit {cfg ? '' : ''}stablecoins, hold vault shares, and let the guardrail-bounded
             Velora desk manage a basket of Robinhood Chain Stock Tokens. Non-custodial — you can
             always redeem in-kind. Guardrails are enforced on-chain, not promised.</p>
          <p className="vx-warn">⚠️ Testnet preview · not audited · Stock Tokens are not for US persons.</p>
        </div>
      )}

      {account && pos && (
        <div className="vx-grid">
          <section className="vx-card vx-span">
            <h2>Your position</h2>
            <div className="vx-stats">
              <Stat label="Your shares" value={`${fmt(pos.shares, pos.vdec)} ${pos.symbol}`} />
              <Stat label="Est. value" value={`${fmt(pos.value, pos.uDec)} ${pos.uSym}`} />
              <Stat label={`${pos.uSym} in wallet`} value={fmt(pos.uBal, pos.uDec)} />
              <Stat label="Vault NAV" value={`${fmt(pos.nav, pos.uDec)} ${pos.uSym}`} />
              <Stat label="Withdrawable now" value={`${fmt(pos.maxWd, pos.uDec)} ${pos.uSym}`} />
            </div>
          </section>

          <section className="vx-card">
            <h2>Deposit</h2>
            <p className="vx-sub">Buy vault shares with {pos.uSym}.</p>
            <input className="vx-in" placeholder={`0.0 ${pos.uSym}`} value={depAmt} onChange={(e) => setDepAmt(e.target.value)} />
            <button className="vx-btn vx-full" disabled={busy} onClick={doDeposit}>Deposit</button>
          </section>

          <section className="vx-card">
            <h2>Withdraw</h2>
            <p className="vx-sub">Redeem shares for {pos.uSym} (up to liquid cash).</p>
            <input className="vx-in" placeholder={`0.0 ${pos.uSym}`} value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} />
            <button className="vx-btn vx-full" disabled={busy} onClick={doWithdraw}>Withdraw</button>
          </section>

          <section className="vx-card">
            <h2>Redeem in-kind</h2>
            <p className="vx-sub">Always solvent: get a pro-rata slice of cash + every Stock Token.</p>
            <input className="vx-in" placeholder={`shares (${pos.symbol})`} value={inkindShares} onChange={(e) => setInkindShares(e.target.value)} />
            <button className="vx-btn vx-full" disabled={busy} onClick={doRedeemInKind}>Redeem in-kind</button>
          </section>

          {cfg.contracts.autosave && (
            <section className="vx-card vx-span">
              <h2>Autosave (DCA)</h2>
              {pos.plan && pos.plan.active ? (
                <div>
                  <p className="vx-sub">
                    Active: {fmt(pos.plan.amountPerPeriod, pos.uDec)} {pos.uSym} every{' '}
                    {(Number(pos.plan.period) / 86400).toFixed(0)}d · done {String(pos.plan.periodsDone)}
                    {Number(pos.plan.totalPeriods) ? `/${String(pos.plan.totalPeriods)}` : ' (open-ended)'}
                  </p>
                  <button className="vx-btn vx-ghost" disabled={busy} onClick={doCancelPlan}>Cancel plan</button>
                </div>
              ) : (
                <div className="vx-row">
                  <input className="vx-in" placeholder={`amount ${pos.uSym}`} value={saveAmt} onChange={(e) => setSaveAmt(e.target.value)} />
                  <input className="vx-in" placeholder="every N days" value={savePeriodDays} onChange={(e) => setSavePeriodDays(e.target.value)} />
                  <input className="vx-in" placeholder="# periods (0=∞)" value={savePeriods} onChange={(e) => setSavePeriods(e.target.value)} />
                  <button className="vx-btn" disabled={busy} onClick={doCreatePlan}>Start saving</button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="vx-stat">
      <div className="vx-stat-l">{label}</div>
      <div className="vx-stat-v">{value}</div>
    </div>
  )
}

const CSS = `
  :root { color-scheme: dark; }
  .vx-wrap { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #e6e8ee; }
  body { background: #0a0b0f; margin: 0; }
  .vx-head { display: flex; align-items: center; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid #1c1f2a; }
  .vx-brand { font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
  .vx-brand span { color: #22c55e; }
  .vx-net { color: #8b90a0; font-size: 13px; }
  .vx-acct { margin-left: auto; font-family: ui-monospace, monospace; font-size: 13px; background: #12151f; padding: 6px 10px; border-radius: 8px; border: 1px solid #1c1f2a; }
  .vx-btn { margin-left: auto; background: #22c55e; color: #04120a; font-weight: 700; border: 0; border-radius: 10px; padding: 10px 16px; cursor: pointer; font-size: 14px; }
  .vx-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .vx-btn.vx-full { margin: 0; width: 100%; }
  .vx-btn.vx-ghost { margin: 0; background: transparent; color: #e6e8ee; border: 1px solid #2a2f3d; }
  .vx-hero { padding: 48px 8px; max-width: 640px; }
  .vx-hero h1 { font-size: 34px; letter-spacing: -0.03em; margin: 0 0 12px; }
  .vx-hero p { color: #aeb3c2; line-height: 1.6; }
  .vx-warn { color: #f59e0b; font-size: 13px; }
  .vx-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; }
  .vx-card { background: #0f1219; border: 1px solid #1c1f2a; border-radius: 14px; padding: 18px; }
  .vx-span { grid-column: 1 / -1; }
  .vx-card h2 { font-size: 15px; margin: 0 0 4px; }
  .vx-sub { color: #8b90a0; font-size: 13px; margin: 0 0 12px; }
  .vx-in { width: 100%; box-sizing: border-box; background: #0a0c12; border: 1px solid #232838; border-radius: 9px; padding: 10px; color: #e6e8ee; font-size: 14px; margin-bottom: 10px; }
  .vx-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .vx-row .vx-in { flex: 1; min-width: 120px; margin: 0; }
  .vx-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .vx-stat-l { color: #8b90a0; font-size: 12px; }
  .vx-stat-v { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .vx-err { background: #2a1416; border: 1px solid #5b2126; color: #fca5a5; padding: 10px 12px; border-radius: 9px; margin: 14px 0; font-size: 13px; }
  .vx-status { background: #10221a; border: 1px solid #1f5137; color: #86efac; padding: 10px 12px; border-radius: 9px; margin: 14px 0; font-size: 13px; }
  @media (max-width: 640px) { .vx-grid { grid-template-columns: 1fr; } }
`
