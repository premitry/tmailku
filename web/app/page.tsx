'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Copy, RefreshCw, Trash2, Mail, ChevronDown, Check,
  ShieldCheck, Zap, Clock, Pencil, X, Volume2, Plus,
} from 'lucide-react'
import { api, type EmailSummary, type Branding } from '@/lib/api'
import { getAddresses, saveAddress, removeAddress, getActive, setActive, type SavedAddress } from '@/lib/store'
import ThemeToggle from '@/components/ThemeToggle'
import BrandingProvider from '@/components/BrandingProvider'

export default function Home() {
  const [branding, setBranding] = useState<Branding | null>(null)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [active, setActiveAddr] = useState('')
  const [domains, setDomains] = useState<string[]>([])
  const [emails, setEmails] = useState<EmailSummary[]>([])
  const [open, setOpen] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customLocal, setCustomLocal] = useState('')
  const [customDomain, setCustomDomain] = useState('')
  const [booted, setBooted] = useState(false)
  const [inboxError, setInboxError] = useState('')
  const [inboxLoading, setInboxLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [liveConnected, setLiveConnected] = useState(false)
  const latestRequest = useRef(0)
  const switcherRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async (addr: string, manual = false, sync = false) => {
    if (!addr) return
    const requestId = ++latestRequest.current
    if (manual) setRefreshing(true)
    if (manual) setInboxLoading(true)
    setInboxError('')
    try {
      const { emails: nextEmails } = await api.inbox(addr, manual || sync)
      if (requestId !== latestRequest.current) return
      setEmails(nextEmails)
      setLastUpdated(Date.now())
    } catch (e: any) {
      if (requestId !== latestRequest.current) return
      setInboxError(e?.message || 'Gagal mengambil email, coba refresh kembali.')
    } finally {
      if (requestId === latestRequest.current) {
        if (manual) setRefreshing(false)
        setInboxLoading(false)
      }
    }
  }, [])

  async function generate(opts: { domain?: string; local?: string } = {}) {
    setLoading(true)
    try {
      const r = await api.createAddress(opts)
      const saved: SavedAddress = { address: r.address, ownerToken: r.ownerToken, expiresAt: r.expiresAt, domain: r.domain }
      saveAddress(saved)
      setAddresses(getAddresses())
      setActiveAddr(r.address)
      setCustomMode(false)
      setCustomLocal('')
      setShowSwitcher(false)
      setEmails([])
      setInboxError('')
      await refresh(r.address, false, true)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const localAddresses = getAddresses()
    const localActive = getActive()
    setAddresses(localAddresses)
    setActiveAddr(localActive)
    api.domains().then(async (d) => {
      setDomains(d.domains)
      if (d.domains[0]) setCustomDomain(d.domains[0])
      if (!localActive && localAddresses.length === 0 && !booted) {
        setBooted(true)
        await generate()
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tutup switcher saat klik di luar
  useEffect(() => {
    if (!showSwitcher) return
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSwitcher])

  useEffect(() => {
    if (!active) return
    setEmails([])
    setInboxError('')
    setLiveConnected(false)
    setInboxLoading(true)
    refresh(active, false, true)

    let es: EventSource | null = null
    try {
      es = new EventSource((process.env.NEXT_PUBLIC_API_BASE || '') + '/api/stream/' + encodeURIComponent(active))
      es.addEventListener('hello', () => setLiveConnected(true))
      es.addEventListener('new', () => refresh(active))
      es.onerror = () => setLiveConnected(false)
    } catch {
      setLiveConnected(false)
    }

    let tick = 0
    const iv = setInterval(() => {
      tick += 1
      refresh(active, false, tick % 3 === 0)
    }, 5000)

    return () => {
      es?.close()
      clearInterval(iv)
    }
  }, [active, refresh])

  function submitCustom() {
    if (!customLocal) return
    generate({ local: customLocal, domain: domains.length > 1 ? customDomain : domains[0] })
  }

  function copy() {
    if (!active) return
    navigator.clipboard.writeText(active)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function openEmail(id: string) {
    const full = await api.email(id)
    setOpen(full)
    refresh(active)
  }

  function removeCurrent() {
    removeAddress(active)
    const list = getAddresses()
    const next = getActive()
    setAddresses(list)
    setActiveAddr(next)
    setEmails([])
    setInboxError('')
  }

  const activeDomain = domains.length > 1 ? customDomain : (domains[0] || '')
  const activeLabel = active || (loading ? 'Membuat alamat...' : 'Belum ada alamat')

  return (
    <main className="page-root">
      <BrandingProvider onLoad={setBranding} />

      {/* Header */}
      <header className="page-header">
        <div className="header-logo">
          {branding?.logoUrl
            ? <img src={branding.logoUrl} alt="" className="h-6 w-6 object-contain" />
            : <Zap size={18} className="text-primary-color" />}
          <span>{branding?.appName || 'TMailku'}</span>
        </div>
        <nav className="header-nav">
          <div className="badge-group">
            <span className="feature-badge"><ShieldCheck size={12} /> Private</span>
            <span className="feature-badge"><Zap size={12} /> Real-time</span>
            <span className="feature-badge"><Clock size={12} /> No Signup</span>
          </div>
          <a className="nav-link" href={(process.env.NEXT_PUBLIC_API_BASE || '') + '/docs'} target="_blank" rel="noreferrer">API</a>
          <ThemeToggle />
        </nav>
      </header>

      {/* Konten utama */}
      <section className="main-content">
        {/* Card email address */}
        <div className="card address-card">
          {customMode ? (
            /* Mode custom email */
            <div className="custom-mode-wrap">
              <div className="custom-mode-header">
                <span className="custom-mode-title">Buat email custom</span>
                <button className="icon-btn" onClick={() => setCustomMode(false)} aria-label="Tutup custom mode">
                  <X size={15} />
                </button>
              </div>
              <div className="custom-mode-inputs">
                <input
                  className="custom-input mono"
                  placeholder="namaku"
                  value={customLocal}
                  onChange={(e) => setCustomLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitCustom() }}
                />
                <span className="at-sign">@</span>
                {domains.length > 1 ? (
                  <select className="custom-select mono" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)}>
                    {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                ) : (
                  <span className="mono domain-label">{domains[0] || '...'}</span>
                )}
                <button className="btn-primary-sm" disabled={loading || !customLocal} onClick={submitCustom}>
                  {loading ? '...' : 'Buat'}
                </button>
              </div>
              {customLocal && (
                <div className="custom-preview mono">{customLocal}@{activeDomain}</div>
              )}
            </div>
          ) : (
            /* Selector email aktif */
            <div className="address-selector-wrap" ref={switcherRef}>
              <button
                className="address-display"
                onClick={() => setShowSwitcher((s) => !s)}
                disabled={!active && loading}
                aria-expanded={showSwitcher}
                aria-haspopup="listbox"
              >
                <span className="address-text mono" title={activeLabel}>{activeLabel}</span>
                <ChevronDown size={18} className={'chevron-icon' + (showSwitcher ? ' rotated' : '')} />
              </button>

              {/* Dropdown multi-email */}
              {showSwitcher && (
                <div className="address-dropdown" role="listbox">
                  {addresses.map((a) => (
                    <button
                      key={a.address}
                      className={'dropdown-item mono' + (a.address === active ? ' active' : '')}
                      role="option"
                      aria-selected={a.address === active}
                      onClick={() => {
                        setActive(a.address)
                        setActiveAddr(a.address)
                        setShowSwitcher(false)
                        setEmails([])
                        setInboxError('')
                      }}
                    >
                      {a.address}
                    </button>
                  ))}
                  {addresses.length === 0 && (
                    <div className="dropdown-empty">Belum ada email tersimpan</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tombol aksi */}
          <div className="action-buttons">
            <button className="action-btn" onClick={() => { setShowSwitcher(false); setCustomMode((s) => !s) }} title="Custom email">
              <Pencil size={15} />
              <span>Change</span>
            </button>
            <button className="action-btn" onClick={copy} disabled={!active} title="Salin alamat">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            <button className="action-btn action-btn-danger" onClick={removeCurrent} disabled={!active} title="Hapus alamat">
              <Trash2 size={15} />
              <span>Delete</span>
            </button>
            <button className="action-btn" onClick={() => refresh(active, true)} disabled={!active || refreshing} title="Refresh inbox">
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
              <span>{refreshing ? '...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Card inbox */}
        <div className="card inbox-card">
          {/* Header inbox */}
          <div className="inbox-header">
            <div className="inbox-title">
              <Mail size={17} className="text-primary-color" />
              <span>Messages</span>
              <span className="count-badge">{emails.length}</span>
            </div>
            <div className="inbox-controls">
              <button className="sound-btn" aria-label="Notifikasi suara">
                <Volume2 size={14} />
              </button>
              <span className={'live-pill' + (liveConnected ? '' : ' live-pill-polling')}>
                <span className={'live-dot' + (inboxError ? ' dot-error' : liveConnected ? ' dot-live' : ' dot-polling')} />
                {inboxError ? 'Error' : liveConnected ? 'Live' : 'Polling'}
              </span>
            </div>
          </div>

          {/* Error banner */}
          {inboxError && (
            <div className="error-banner">
              <span>{inboxError}</span>
              <button className="error-retry" onClick={() => refresh(active, true, true)} disabled={!active || refreshing}>
                Coba lagi
              </button>
            </div>
          )}

          {/* Isi inbox */}
          <div className="inbox-body">
            {inboxLoading && emails.length === 0 ? (
              <div className="inbox-empty">
                <RefreshCw size={40} className="empty-icon spin" />
                <p>Mengambil email terbaru...</p>
              </div>
            ) : emails.length === 0 ? (
              <div className="inbox-empty">
                <Mail size={40} className="empty-icon" />
                <p className="empty-title">Your inbox is empty</p>
                <p className="empty-sub">Waiting for incoming emails...</p>
              </div>
            ) : (
              <div className="email-list">
                {emails.map((e) => (
                  <button key={e.id} onClick={() => openEmail(e.id)} className="email-row">
                    <div className="email-avatar">
                      <Mail size={14} />
                    </div>
                    <div className="email-meta">
                      <div className="email-from">{e.from_name || e.from_addr}</div>
                      <div className="email-subject">{e.subject || '(tanpa subjek)'}</div>
                    </div>
                    {e.otp_code && (
                      <button
                        className="otp-pill"
                        onClick={(ev) => { ev.stopPropagation(); navigator.clipboard.writeText(e.otp_code!) }}
                        title="Klik untuk salin OTP"
                      >
                        {e.otp_code}
                      </button>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {lastUpdated && (
            <div className="inbox-footer">
              Diperbarui: {new Date(lastUpdated).toLocaleTimeString('id-ID')}
            </div>
          )}
        </div>
      </section>

      {/* Modal baca email */}
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-subject">{open.subject || '(tanpa subjek)'}</h3>
              <button className="icon-btn" onClick={() => setOpen(null)} aria-label="Tutup">
                <X size={16} />
              </button>
            </div>
            <div className="modal-from">Dari: {open.from_addr}</div>
            {open.otp_code && (
              <div className="modal-otp">
                Kode OTP: <strong>{open.otp_code}</strong>
                <button className="icon-btn" onClick={() => navigator.clipboard.writeText(open.otp_code)}>
                  <Copy size={12} />
                </button>
              </div>
            )}
            <div className="modal-body">
              {open.body_html ? (
                <div className="prose" dangerouslySetInnerHTML={{ __html: open.body_html }} />
              ) : (
                <pre className="email-pretext">{open.body_text}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
