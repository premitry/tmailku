'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Copy, RefreshCw, Trash2, Mail, ChevronDown, Check,
  ShieldCheck, Zap, Clock, Pencil, X, Volume2,
  ArrowLeft, Key, Paperclip,
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
  const [liveConnected, setLiveConnected] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const latestRequest = useRef(0)
  const switcherRef = useRef<HTMLDivElement>(null)
  const prevCount = useRef(0)

  const refresh = useCallback(async (addr: string, manual = false, sync = false) => {
    if (!addr) return
    const rid = ++latestRequest.current
    if (manual) { setRefreshing(true); setInboxLoading(true) }
    setInboxError('')
    try {
      const { emails: next } = await api.inbox(addr, manual || sync)
      if (rid !== latestRequest.current) return
      if (soundEnabled && next.length > prevCount.current) {
        try { new Audio('/notify.mp3').play() } catch {}
      }
      prevCount.current = next.length
      setEmails(next)
    } catch (e: any) {
      if (rid !== latestRequest.current) return
      setInboxError(e?.message || 'Gagal mengambil email.')
    } finally {
      if (rid === latestRequest.current) {
        if (manual) { setRefreshing(false); setInboxLoading(false) }
        else setInboxLoading(false)
      }
    }
  }, [soundEnabled])

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

  useEffect(() => {
    if (!showSwitcher) return
    function handle(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false)
        setCustomMode(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showSwitcher])

  useEffect(() => {
    if (!active) return
    setEmails([])
    setInboxError('')
    setLiveConnected(false)
    setInboxLoading(true)
    prevCount.current = 0
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
    const iv = setInterval(() => { tick++; refresh(active, false, tick % 3 === 0) }, 5000)
    return () => { es?.close(); clearInterval(iv) }
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
    setShowSwitcher(false)
  }

  function switchTo(addr: string) {
    setActive(addr)
    setActiveAddr(addr)
    setShowSwitcher(false)
    setCustomMode(false)
    setEmails([])
    setInboxError('')
  }

  const appName = branding?.appName || 'TMailku'
  const activeDomain = domains.length > 1 ? customDomain : (domains[0] || '')

  return (
    <main className="pg-root">
      <BrandingProvider onLoad={setBranding} />

      {/* ── Header ── */}
      <header className="pg-header">
        <div className="pg-header-inner">
          <div className="pg-logo">
            {branding?.logoUrl
              ? <img src={branding.logoUrl} alt="" className="pg-logo-img" />
              : <Zap size={15} className="pg-logo-icon" />}
            <span className="pg-logo-text">{appName}</span>
          </div>
          <div className="pg-badges">
            <span className="pg-badge"><ShieldCheck size={11} />Private</span>
            <span className="pg-badge"><Zap size={11} />Real-time</span>
            <span className="pg-badge"><Clock size={11} />No Signup</span>
          </div>
          <div className="pg-header-end">
            <a
              className="pg-link"
              href={(process.env.NEXT_PUBLIC_API_BASE || '') + '/docs'}
              target="_blank"
              rel="noreferrer"
            >
              API
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="pg-hero">
        <h1 className="pg-hero-title">{branding?.heroTitle || 'Email Sementara Instan'}</h1>
        <p className="pg-hero-sub">{branding?.heroSubtitle || 'Privat, real-time, tanpa registrasi.'}</p>
      </div>

      {/* ── Main ── */}
      <div className="pg-main">

        {/* Address card */}
        <div className="addr-card" ref={switcherRef}>

          {/* Bar selector */}
          <button
            className="addr-bar"
            onClick={() => { setShowSwitcher(v => !v); setCustomMode(false) }}
            aria-haspopup="listbox"
            aria-expanded={showSwitcher}
          >
            <span className="addr-bar-text">
              {loading ? 'Membuat alamat...' : (active || 'Belum ada alamat')}
            </span>
            <ChevronDown size={16} className={'addr-chevron' + (showSwitcher ? ' open' : '')} />
          </button>

          {/* Dropdown — daftar email + aksi */}
          {showSwitcher && (
            <div className="addr-dropdown" role="listbox">
              {!customMode ? (
                <>
                  {addresses.length > 0 && (
                    <div className="addr-dropdown-list">
                      {addresses.map(a => (
                        <button
                          key={a.address}
                          className={'addr-option' + (a.address === active ? ' selected' : '')}
                          role="option"
                          aria-selected={a.address === active}
                          onClick={() => switchTo(a.address)}
                        >
                          <span>{a.address}</span>
                          {a.address === active && <Check size={13} className="addr-option-check" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {addresses.length === 0 && (
                    <p className="addr-dropdown-empty">Belum ada email tersimpan</p>
                  )}
                  <div className="addr-dropdown-actions">
                    <button className="addr-dropdown-action" onClick={() => { setShowSwitcher(false); generate() }}>
                      <Zap size={13} /> Buat acak baru
                    </button>
                    <button className="addr-dropdown-action" onClick={() => setCustomMode(true)}>
                      <Pencil size={13} /> Email custom
                    </button>
                  </div>
                </>
              ) : (
                /* Mode custom di dalam dropdown */
                <div className="addr-custom">
                  <div className="addr-custom-head">
                    <button className="addr-custom-back" onClick={() => setCustomMode(false)}>
                      <ArrowLeft size={14} />
                    </button>
                    <span>Email Custom</span>
                  </div>
                  <div className="addr-custom-row">
                    <input
                      className="addr-custom-input"
                      placeholder="namaanda"
                      value={customLocal}
                      onChange={e => setCustomLocal(e.target.value.replace(/[^a-zA-Z0-9._+-]/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && submitCustom()}
                      autoFocus
                    />
                    <span className="addr-custom-at">@</span>
                    {domains.length > 1 ? (
                      <select
                        className="addr-custom-select"
                        value={customDomain}
                        onChange={e => setCustomDomain(e.target.value)}
                      >
                        {domains.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    ) : (
                      <span className="addr-custom-domain">{domains[0] || '...'}</span>
                    )}
                  </div>
                  {customLocal && (
                    <p className="addr-custom-preview">{customLocal}@{activeDomain}</p>
                  )}
                  <button
                    className="addr-custom-btn"
                    onClick={submitCustom}
                    disabled={!customLocal || loading}
                  >
                    {loading ? 'Membuat...' : 'Buat Email'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action buttons: Change / Copy / Delete / Refresh */}
          <div className="addr-actions">
            <button
              className="act-btn"
              onClick={() => { setShowSwitcher(true); setCustomMode(true) }}
              title="Ganti / custom"
            >
              <Pencil size={14} /><span>Change</span>
            </button>
            <button className="act-btn" onClick={copy} disabled={!active} title="Salin">
              {copied
                ? <><Check size={14} /><span>Copied!</span></>
                : <><Copy size={14} /><span>Copy</span></>}
            </button>
            <button className="act-btn act-btn-danger" onClick={removeCurrent} disabled={!active} title="Hapus">
              <Trash2 size={14} /><span>Delete</span>
            </button>
            <button className="act-btn" onClick={() => refresh(active, true)} disabled={!active || refreshing} title="Refresh">
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} /><span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Inbox card */}
        <div className="inbox-card">
          <div className="inbox-head">
            <div className="inbox-head-left">
              <Mail size={16} className="inbox-head-icon" />
              <span className="inbox-head-label">Messages</span>
              <span className="inbox-count">{emails.length}</span>
            </div>
            <div className="inbox-head-right">
              <button
                className={'inbox-sound' + (soundEnabled ? ' on' : '')}
                onClick={() => setSoundEnabled(v => !v)}
                title={soundEnabled ? 'Matikan suara' : 'Aktifkan suara'}
              >
                <Volume2 size={13} />
              </button>
              <span className={'inbox-live' + (liveConnected ? ' live' : '')}>
                <span className="inbox-live-dot" />
                {liveConnected ? 'Live' : 'Polling'}
              </span>
            </div>
          </div>

          {inboxError && (
            <div className="inbox-error">
              {inboxError}
              <button onClick={() => refresh(active, true)} className="inbox-error-retry">Coba lagi</button>
            </div>
          )}

          <div className="inbox-body">
            {inboxLoading && emails.length === 0 ? (
              <div className="inbox-empty">
                <RefreshCw size={36} className="inbox-empty-icon spin" />
                <p>Memuat email...</p>
              </div>
            ) : emails.length === 0 ? (
              <div className="inbox-empty">
                <Mail size={36} className="inbox-empty-icon" />
                <p className="inbox-empty-title">Your inbox is empty</p>
                <p className="inbox-empty-sub">Waiting for incoming emails...</p>
              </div>
            ) : (
              <ul className="email-list">
                {emails.map(em => (
                  <li key={em.id}>
                    <button className={'email-row' + (em.seen ? ' seen' : '')} onClick={() => openEmail(em.id)}>
                      <div className="email-av">
                        {(em.from_name || em.from_addr || '?')[0].toUpperCase()}
                      </div>
                      <div className="email-info">
                        <div className="email-top">
                          <span className="email-from">{em.from_name || em.from_addr}</span>
                          <div className="email-tags">
                            {em.otp_code && (
                              <span
                                className="otp-tag"
                                onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(em.otp_code!) }}
                                title="Klik salin OTP"
                              >
                                <Key size={10} />{em.otp_code}
                              </span>
                            )}
                            {!!em.has_attachment && <Paperclip size={12} className="attach-icon" />}
                          </div>
                        </div>
                        <span className="email-subj">{em.subject || '(tanpa subjek)'}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal baca email ── */}
      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-top">
              <div className="modal-meta">
                <h2 className="modal-subj">{open.subject || '(tanpa subjek)'}</h2>
                <p className="modal-from">
                  {open.from_name ? `${open.from_name} <${open.from_addr}>` : open.from_addr}
                </p>
              </div>
              <button className="modal-close" onClick={() => setOpen(null)} aria-label="Tutup">
                <X size={16} />
              </button>
            </div>
            {open.otp_code && (
              <div className="modal-otp">
                <Key size={13} />
                <span>Kode OTP: <strong>{open.otp_code}</strong></span>
                <button
                  className="modal-otp-copy"
                  onClick={() => navigator.clipboard.writeText(open.otp_code)}
                >
                  <Copy size={12} />
                </button>
              </div>
            )}
            <div className="modal-body">
              {open.body_html
                ? <div className="email-html" dangerouslySetInnerHTML={{ __html: open.body_html }} />
                : <pre className="email-text">{open.body_text || '(tidak ada konten)'}</pre>}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
