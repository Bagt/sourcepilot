import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { PartSpec, SearchResult, Supplier, HistoryEntry } from '../lib/types'

const INVITE_CODE = process.env.NEXT_PUBLIC_INVITE_CODE || 'sourcepilot2024'

const PRESETS: { label: string; spec: PartSpec }[] = [
  {
    label: 'Peristaltic pump 12V',
    spec: {
      description: 'Peristaltic pump 12V DC, 100–300ml/min flow rate, food-grade silicone tubing, self-priming, IP44 rated, for liquid transfer in brewing equipment',
      quantity: '500',
      targetPrice: '8.50',
      leadTime: '8 weeks',
      certifications: 'CE and RoHS',
    },
  },
  {
    label: 'NTC temp sensor 10k',
    spec: {
      description: 'NTC thermistor 10k ohm temperature sensor, accuracy ±0.5°C, range -20°C to 100°C, food-safe housing for liquid immersion, with stainless steel probe',
      quantity: '1000',
      targetPrice: '1.20',
      leadTime: '4 weeks',
      certifications: 'RoHS compliant',
    },
  },
  {
    label: 'Solenoid valve ½"',
    spec: {
      description: 'Solenoid valve 1/2 inch NPT, 12V DC, normally closed, food-grade stainless steel body and EPDM seal, max 6 bar, for wort/water control',
      quantity: '300',
      targetPrice: '5.50',
      leadTime: '6 weeks',
      certifications: 'CE and RoHS',
    },
  },
  {
    label: 'NEMA17 stepper motor',
    spec: {
      description: 'Stepper motor NEMA17, 1.8 degree step, 40Ncm holding torque, 12–24V, 1.5A, for precision liquid dispensing mechanism',
      quantity: '200',
      targetPrice: '6.00',
      leadTime: '4 weeks',
      certifications: 'RoHS compliant',
    },
  },
  {
    label: 'ESP32 WROOM module',
    spec: {
      description: 'ESP32-WROOM-32 WiFi and Bluetooth dual-core microcontroller module, 4MB flash, 240MHz, for IoT brewing controller embedded systems',
      quantity: '1000',
      targetPrice: '2.50',
      leadTime: '2 weeks',
      certifications: 'CE and RoHS',
    },
  },
]

const PROGRESS_STEPS = [
  'Parsing specs',
  'Alibaba scan',
  'Digi-Key / Mouser',
  'Global Sources',
  'Ranking results',
]

function ScoreBadge({ score }: { score: string }) {
  const cls = score === 'A' ? 'score-a' : score === 'B' ? 'score-b' : 'score-c'
  return <span className={`score-badge ${cls}`}>Score {score}</span>
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  )
}

interface RFQModalProps {
  supplier: Supplier
  spec: PartSpec
  onClose: () => void
}

function RFQModal({ supplier, spec, onClose }: RFQModalProps) {
  const [rfq, setRfq] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/rfq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierName: supplier.name, platform: supplier.platform, spec }),
    })
      .then((r) => r.json())
      .then((d) => {
        setRfq(d.rfq || 'Failed to generate RFQ.')
        setLoading(false)
      })
      .catch(() => {
        setRfq('Failed to generate RFQ. Check your API key.')
        setLoading(false)
      })
  }, [supplier, spec])

  function handleCopy() {
    navigator.clipboard.writeText(rfq)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">RFQ draft — {supplier.name}</div>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '20px 0' }}>
            Generating RFQ...
          </div>
        ) : (
          <div className="modal-body">{rfq}</div>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          {!loading && (
            <button className="btn btn-primary" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy to clipboard'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface SupplierCardProps {
  supplier: Supplier
  isTop: boolean
  spec: PartSpec
}

function SupplierCard({ supplier, isTop, spec }: SupplierCardProps) {
  const [showRFQ, setShowRFQ] = useState(false)

  return (
    <>
      <div className={`supplier-card${isTop ? ' top' : ''}`}>
        <div className="card-head">
          <div>
            {isTop && <div className="top-tag">⚡ Top match</div>}
            <div className="supplier-name">{supplier.name}</div>
            <div className="supplier-origin">{supplier.platform} · {supplier.country}</div>
          </div>
          <ScoreBadge score={supplier.score} />
        </div>

        <div className="metrics">
          <MetricBox label="Unit price" value={supplier.unit_price} />
          <MetricBox label="MOQ" value={supplier.moq} />
          <MetricBox label="Lead time" value={supplier.lead_time} />
          <MetricBox label="Certs" value={supplier.certifications || 'Verify'} />
        </div>

        <div className="card-notes">
          <strong>Why {supplier.score}:</strong> {supplier.score_reason}
          <br /><br />
          {supplier.notes}
          {supplier.search_tip && (
            <>
              <br /><br />
              <strong>Model / series:</strong>{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--bg-raised)', padding: '2px 7px', borderRadius: 3, color: 'var(--accent)', border: '1px solid var(--border)' }}>
                {supplier.search_tip}
              </span>
            </>
          )}
          {supplier.storefront_url && (
            <>
              <br /><br />
              <strong>Direct link:</strong>{' '}
              <a href={supplier.storefront_url.startsWith('http') ? supplier.storefront_url : `https://${supplier.storefront_url}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12, wordBreak: 'break-all' }}>
                {supplier.storefront_url}
              </a>
            </>
          )}
        </div>

        <div className="card-actions">
          <button className="btn btn-primary" onClick={() => setShowRFQ(true)}>
            Draft RFQ →
          </button>
          {supplier.storefront_url ? (
            <a
              href={supplier.storefront_url.startsWith('http') ? supplier.storefront_url : `https://${supplier.storefront_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              Open storefront ↗
            </a>
          ) : (
            <a
              href={(() => {
                const tipQuery = encodeURIComponent(supplier.search_tip || supplier.name)
                const nameQuery = encodeURIComponent(supplier.name)
                const isAlibaba = supplier.platform.toLowerCase().includes('alibaba') || supplier.platform.toLowerCase().includes('oem')
                if (isAlibaba) return `https://www.alibaba.com/trade/search?SearchText=${nameQuery}&tab=supplier`
                if (supplier.platform.includes('Digi-Key')) return `https://www.digikey.com/en/products/result?keywords=${tipQuery}`
                if (supplier.platform.includes('Mouser')) return `https://www.mouser.com/Search/Refine?Keyword=${tipQuery}`
                if (supplier.platform.includes('Global Sources')) return `https://www.globalsources.com/gsol/I/Product-search/a/9000000001784.htm?keywords=${nameQuery}`
                if (supplier.platform.includes('ThomasNet')) return `https://www.thomasnet.com/search/?searchterm=${nameQuery}`
                return `https://www.alibaba.com/trade/search?SearchText=${nameQuery}&tab=supplier`
              })()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              Find on {supplier.platform} ↗
            </a>
          )}
        </div>
      </div>

      {showRFQ && (
        <RFQModal supplier={supplier} spec={spec} onClose={() => setShowRFQ(false)} />
      )}
    </>
  )
}

export default function Home() {
  const [authed, setAuthed] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState('')

  const [spec, setSpec] = useState<PartSpec>({
    description: '',
    quantity: '',
    targetPrice: '',
    leadTime: '',
    certifications: '',
  })
  const [activePreset, setActivePreset] = useState<number | null>(null)

  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressStep, setProgressStep] = useState(0)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const progressRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('sp_authed')
    if (saved === '1') setAuthed(true)
    const hist = localStorage.getItem('sp_history')
    if (hist) setHistory(JSON.parse(hist))
  }, [])

  function handleAuth() {
    if (codeInput.trim().toLowerCase() === INVITE_CODE.toLowerCase()) {
      localStorage.setItem('sp_authed', '1')
      setAuthed(true)
    } else {
      setCodeError('Invalid invite code.')
    }
  }

  function applyPreset(i: number) {
    setActivePreset(i)
    setSpec(PRESETS[i].spec)
    setResult(null)
    setError('')
  }

  function updateSpec(key: keyof PartSpec, value: string) {
    setSpec((prev) => ({ ...prev, [key]: value }))
    setActivePreset(null)
  }

  function startProgress() {
    setProgress(0)
    setProgressStep(0)
    progressRef.current = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(p + Math.random() * 3.5, 90)
        setProgressStep(Math.floor((next / 90) * (PROGRESS_STEPS.length - 1)))
        return next
      })
    }, 300)
  }

  function stopProgress() {
    if (progressRef.current) clearInterval(progressRef.current)
    setProgress(100)
  }

  async function handleSearch() {
    if (!spec.description.trim()) {
      setError('Please enter a component description.')
      return
    }
    setError('')
    setResult(null)
    setLoading(true)
    startProgress()

    try {
      const res = await fetch('/api/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')

      stopProgress()
      setResult(data)

      const entry: HistoryEntry = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        spec: { ...spec },
        result: data,
      }
      const updated = [entry, ...history].slice(0, 10)
      setHistory(updated)
      localStorage.setItem('sp_history', JSON.stringify(updated))
    } catch (err: unknown) {
      stopProgress()
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  function loadHistory(entry: HistoryEntry) {
    setSpec(entry.spec)
    setResult(entry.result)
    setError('')
    setActivePreset(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearHistory() {
    setHistory([])
    localStorage.removeItem('sp_history')
  }

  if (!authed) {
    return (
      <>
        <Head><title>SourcePilot — AI hardware sourcing</title></Head>
        <div className="gate">
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div className="gate-title">SourcePilot</div>
          <div className="gate-sub">AI sourcing agent for hardware DTC brands</div>
          <div className="gate-form">
            <input
              type="text"
              placeholder="Enter invite code"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              autoFocus
            />
            <button className="btn btn-primary" onClick={handleAuth}>Enter</button>
          </div>
          {codeError && <div className="gate-error">{codeError}</div>}
          <div style={{ marginTop: 32, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'system-ui' }}>
            Early access · v0.1
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head><title>SourcePilot</title></Head>
      <div className="page">
        <nav className="nav">
          <div className="container nav-inner">
            <a href="/" className="nav-logo">
              <div className="logo-mark">SP</div>
              SourcePilot
            </a>
            <span className="nav-badge">v0.1 · early access</span>
          </div>
        </nav>

        <main className="main">
          <div className="container">

            {/* Form */}
            <div className="form-panel">
              <div className="section-label">Quick presets — MiniBrew parts</div>
              <div className="presets">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    className={`preset${activePreset === i ? ' active' : ''}`}
                    onClick={() => applyPreset(i)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="form-grid">
                <div className="form-group span2">
                  <label className="form-label">Component description</label>
                  <textarea
                    className="form-input form-textarea"
                    placeholder="e.g. Peristaltic pump 12V DC, 100–300ml/min, food-grade silicone tubing, for brewing equipment"
                    value={spec.description}
                    onChange={(e) => updateSpec('description', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity (units)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 500"
                    value={spec.quantity}
                    onChange={(e) => updateSpec('quantity', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Target unit price (USD)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 8.50"
                    step="0.01"
                    value={spec.targetPrice}
                    onChange={(e) => updateSpec('targetPrice', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Max lead time</label>
                  <select
                    className="form-input form-select"
                    value={spec.leadTime}
                    onChange={(e) => updateSpec('leadTime', e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="2 weeks">2 weeks</option>
                    <option value="4 weeks">4 weeks</option>
                    <option value="6 weeks">6 weeks</option>
                    <option value="8 weeks">8 weeks</option>
                    <option value="12 weeks">12 weeks</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Certifications</label>
                  <select
                    className="form-input form-select"
                    value={spec.certifications}
                    onChange={(e) => updateSpec('certifications', e.target.value)}
                  >
                    <option value="">None required</option>
                    <option value="CE marking">CE</option>
                    <option value="FDA food-grade">FDA food-grade</option>
                    <option value="RoHS compliant">RoHS</option>
                    <option value="UL listed">UL</option>
                    <option value="CE and RoHS">CE + RoHS</option>
                    <option value="CE, RoHS, and FDA food-grade">CE + RoHS + FDA</option>
                  </select>
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
                onClick={handleSearch}
                disabled={loading}
              >
                {loading ? 'Searching...' : 'Find suppliers →'}
              </button>

              {error && <div className="error-box">{error}</div>}
            </div>

            {/* Progress */}
            {loading && (
              <div className="progress-wrap">
                <div className="progress-steps">
                  {PROGRESS_STEPS.map((s, i) => (
                    <span
                      key={i}
                      className={`progress-step${i === progressStep ? ' active' : i < progressStep ? ' done' : ''}`}
                    >
                      {i < progressStep ? '✓ ' : ''}{s}
                    </span>
                  ))}
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* Results */}
            {result && (
              <div>
                <div className="results-header">
                  <span className="results-title">Matched suppliers</span>
                  <span className="results-count">{result.suppliers.length} found</span>
                </div>

                {/* Summary + sources at top */}
                <div style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border)',
                  borderLeft: '3px solid var(--accent)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '14px 18px',
                  marginBottom: 14,
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: 'system-ui', marginBottom: 12 }}>
                    <strong style={{ color: 'var(--text)' }}>Agent summary:</strong> {result.summary}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginRight: 2 }}>Sources checked</span>
                    {['Alibaba', 'Global Sources', 'Digi-Key', 'Mouser', 'ThomasNet'].map((src) => {
                      const hit = result.suppliers.some(s => s.platform.includes(src))
                      return (
                        <span key={src} style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 3,
                          border: '1px solid',
                          borderColor: hit ? 'rgba(200,245,90,0.3)' : 'var(--border)',
                          background: hit ? 'var(--accent-dim)' : 'transparent',
                          color: hit ? 'var(--accent)' : 'var(--text-dim)',
                          fontWeight: hit ? 600 : 400,
                        }}>
                          {hit ? '✓ ' : ''}{src}
                        </span>
                      )
                    })}
                  </div>
                </div>

                <div className="supplier-list">
                  {result.suppliers.map((s, i) => (
                    <SupplierCard key={i} supplier={s} isTop={i === 0} spec={spec} />
                  ))}
                </div>

                {/* Suggestions panel */}
                {result.suggestions && result.suggestions.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{
                      background: 'var(--bg-raised)',
                      border: '1px solid var(--border)',
                      borderLeft: '3px solid var(--amber)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '16px 18px',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 12 }}>
                        {result.suppliers.length === 0 ? '⚠ No matches found — adjust your specs' : '💡 Suggestions to improve results'}
                      </div>
                      {result.suggestions.map((s, i) => (
                        <div key={i} style={{
                          borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                          paddingTop: i > 0 ? 12 : 0,
                          marginTop: i > 0 ? 12 : 0,
                        }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 3,
                              background: 'var(--amber-dim)',
                              color: 'var(--amber)',
                              border: '1px solid rgba(245,166,35,0.2)',
                              flexShrink: 0,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}>
                              {s.field}
                            </span>
                            <div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'system-ui' }}>{s.issue}</div>
                              <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'system-ui', fontWeight: 500 }}>→ {s.suggestion}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div style={{ marginTop: 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div className="section-label">Recent searches</div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={clearHistory}>
                    Clear
                  </button>
                </div>
                <div className="history-panel">
                  {history.map((entry) => (
                    <div key={entry.id} className="history-row" onClick={() => loadHistory(entry)}>
                      <span className="history-desc">{entry.spec.description}</span>
                      <span className="history-meta">
                        {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' · '}
                        {entry.result.suppliers.length} results
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  )
}
