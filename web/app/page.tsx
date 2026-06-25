'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, RefreshCw, Trash2, Plus, Mail, ChevronDown, Check, ShieldCheck, Zap, Clock, Pencil, X } from 'lucide-react'
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

	const refresh = useCallback(async (addr: string, manual = false, sync = false) => {
		if (!addr) return
		const requestId = ++latestRequest.current
		if (manual) setRefreshing(true)
		if (manual) setInboxLoading(true)
		setInboxError('')
		try {
			// manual/sync = request ulang ke server + paksa sync IMAP bila domain memakai IMAP.
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
			// Auto-generate alamat untuk pengunjung baru.
			if (!localActive && localAddresses.length === 0 && !booted) {
				setBooted(true)
				await generate()
			}
		}).catch(() => {})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

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

		// Polling fallback: request ulang ke server tiap beberapa detik.
		// Setiap beberapa cycle ikut paksa sync IMAP agar inbox IMAP juga auto update tanpa F5.
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
		<main className="mx-auto w-full max-w-[1120px] px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,2.5vw,1.75rem)]">
			<BrandingProvider onLoad={setBranding} />
			<header className="flex items-center justify-between mb-[clamp(1.5rem,4vw,2.75rem)]">
				<div className="flex items-center gap-2 font-bold text-lg">
					{branding?.logoUrl ? <img src={branding.logoUrl} alt="" className="h-7 w-7 object-contain" /> : <Zap className="text-primary" />} {branding?.appName || 'TMailku'}
				</div>
				<div className="flex items-center gap-2">
					<a className="btn btn-ghost" href={(process.env.NEXT_PUBLIC_API_BASE || '') + '/docs'} target="_blank" rel="noreferrer">API</a>
					<ThemeToggle />
				</div>
			</header>

			<section className="text-center mb-[clamp(1.5rem,4vw,2.5rem)]">
				<h1 className="text-[clamp(2rem,4.2vw,3.25rem)] leading-tight font-extrabold mb-3">{branding?.heroTitle || 'Email Sementara, Instan & Privat'}</h1>
				<p className="opacity-70 mb-4">{branding?.heroSubtitle || 'Terima email tanpa registrasi. Auto-hapus otomatis.'}</p>
				<div className="flex gap-2 justify-center flex-wrap">
					<span className="pill"><ShieldCheck size={14} /> Private</span>
					<span className="pill"><Zap size={14} /> Real-time</span>
					<span className="pill"><Clock size={14} /> Auto-expire</span>
				</div>
			</section>

			<div className="glass p-[clamp(1rem,2.4vw,1.5rem)] mb-[clamp(1rem,2.5vw,1.5rem)] overflow-visible">
				<div className="flex items-start justify-center gap-[clamp(0.9rem,2vw,1.35rem)] flex-wrap xl:flex-nowrap">
					<div className="relative min-w-0 flex-1 w-full max-w-[820px]">
						{customMode ? (
							<div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-[clamp(0.85rem,2vw,1.15rem)]">
								<div className="flex items-center justify-between mb-2">
									<div className="text-sm font-semibold opacity-80">Buat email custom</div>
									<button className="opacity-70 hover:opacity-100" onClick={() => setCustomMode(false)}><X size={16} /></button>
								</div>
								<div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
									<input
										className="min-w-0 flex-1 mono text-[clamp(1rem,2.2vw,1.35rem)]"
										placeholder="namaku"
										value={customLocal}
										onChange={(e) => setCustomLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
										onKeyDown={(e) => { if (e.key === 'Enter') submitCustom() }}
									/>
									<span className="opacity-60">@</span>
									{domains.length > 1 ? (
										<select className="!w-auto max-w-[210px] mono text-sm" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)}>
											{domains.map((d) => <option key={d} value={d}>{d}</option>)}
										</select>
									) : (
										<span className="mono opacity-80 text-sm truncate max-w-[220px]">{domains[0] || '...'}</span>
									)}
									<button className="btn btn-primary shrink-0" disabled={loading || !customLocal} onClick={submitCustom}>{loading ? '...' : 'Buat'}</button>
								</div>
								{customLocal && <div className="mono text-xs sm:text-sm opacity-60 mt-2 truncate">{customLocal}@{activeDomain}</div>}
							</div>
						) : (
							<>
								<button className="email-selector-card mono" onClick={() => setShowSwitcher((s) => !s)} disabled={!active && loading} aria-expanded={showSwitcher}>
									<span className="email-selector-text" title={activeLabel}>{activeLabel}</span>
									<span className={"email-selector-chevron " + (showSwitcher ? 'rotate-180' : '')}><ChevronDown size={26} /></span>
								</button>
								{showSwitcher && (
									<div className="email-dropdown" role="listbox">
										{addresses.length === 0 ? (
											<div className="email-dropdown-empty">Belum ada email tersimpan</div>
										) : addresses.map((a) => (
											<button
												key={a.address}
												className={"email-dropdown-item mono " + (a.address === active ? 'is-active' : '')}
												role="option"
												aria-selected={a.address === active}
												title={a.address}
												onClick={() => { setActive(a.address); setActiveAddr(a.address); setShowSwitcher(false); setEmails([]); setInboxError('') }}
											>
												<span>{a.address}</span>
											</button>
										))}
									</div>
								)}
							</>
						)}
					</div>

					<div className="grid grid-cols-2 gap-[clamp(0.65rem,1.4vw,0.9rem)] w-full sm:w-auto sm:min-w-[300px] xl:min-w-[330px] shrink-0">
						<button className="btn btn-primary justify-center min-h-[clamp(3rem,5vw,3.65rem)] px-[clamp(0.9rem,2vw,1.2rem)] text-[clamp(0.95rem,1.35vw,1.08rem)]" onClick={copy} disabled={!active}>{copied ? <Check size={16} /> : <Copy size={16} />} Copy</button>
						<button className="btn btn-ghost justify-center min-h-[clamp(3rem,5vw,3.65rem)] px-[clamp(0.9rem,2vw,1.2rem)] text-[clamp(0.95rem,1.35vw,1.08rem)]" onClick={() => refresh(active, true)} disabled={!active || refreshing}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? '...' : 'Refresh'}</button>
						<button className="btn btn-ghost justify-center min-h-[clamp(3rem,5vw,3.65rem)] px-[clamp(0.9rem,2vw,1.2rem)] text-[clamp(0.95rem,1.35vw,1.08rem)]" onClick={() => { setShowSwitcher(false); setCustomMode((s) => !s) }}><Pencil size={16} /> Custom</button>
						<button className="btn btn-ghost justify-center min-h-[clamp(3rem,5vw,3.65rem)] px-[clamp(0.9rem,2vw,1.2rem)] text-[clamp(0.95rem,1.35vw,1.08rem)]" onClick={removeCurrent} disabled={!active}><Trash2 size={16} /> Hapus</button>
					</div>
				</div>
			</div>

			<div className="glass p-[clamp(1rem,2.4vw,1.5rem)] min-h-[clamp(360px,50vh,640px)]">
				<div className="flex items-center justify-between mb-4">
					<div>
						<div className="flex items-center gap-2 font-semibold"><Mail size={18} /> Kotak Masuk <span className="pill">{emails.length}</span></div>
						{lastUpdated && <div className="text-xs opacity-50 mt-1">Update terakhir: {new Date(lastUpdated).toLocaleTimeString('id-ID')}</div>}
					</div>
					<span className="pill"><span className={"live-dot w-2 h-2 rounded-full inline-block " + (inboxError ? 'bg-red-400' : liveConnected ? 'bg-secondary' : 'bg-yellow-400')} /> {inboxError ? 'Error' : liveConnected ? 'Live' : 'Polling'}</span>
				</div>
				{inboxError && (
					<div className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center justify-between gap-3">
						<span>{inboxError}</span>
						<button className="btn btn-ghost shrink-0" onClick={() => refresh(active, true, true)} disabled={!active || refreshing}>Coba lagi</button>
					</div>
				)}
				{inboxLoading && emails.length === 0 ? (
					<div className="text-center opacity-70 min-h-[clamp(260px,38vh,500px)] flex flex-col items-center justify-center"><RefreshCw size={44} className="mx-auto mb-3 animate-spin" /> Mengambil email terbaru...</div>
				) : emails.length === 0 ? (
					<div className="text-center opacity-60 min-h-[clamp(260px,38vh,500px)] flex flex-col items-center justify-center"><Mail size={44} className="mx-auto mb-3" /> Kotak masuk kosong</div>
				) : (
					<div className="space-y-2 max-h-[clamp(300px,44vh,560px)] overflow-y-auto pr-1">
						{emails.map((e) => (
							<button key={e.id} onClick={() => openEmail(e.id)} className="glass w-full text-left p-3 flex items-center justify-between gap-3">
								<div className="min-w-0 flex-1">
									<div className="font-medium truncate text-[clamp(0.95rem,1.6vw,1.08rem)]">{e.from_name || e.from_addr}</div>
									<div className="text-[clamp(0.82rem,1.25vw,0.95rem)] opacity-70 truncate">{e.subject || '(tanpa subjek)'}</div>
								</div>
								{e.otp_code && <span className="pill text-tertiary shrink-0" onClick={(ev) => { ev.stopPropagation(); navigator.clipboard.writeText(e.otp_code!) }}>OTP {e.otp_code}</span>}
							</button>
						))}
					</div>
				)}
			</div>

			{open && (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-40" onClick={() => setOpen(null)}>
					<div className="popover max-w-2xl w-full p-5 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
						<div className="flex items-center justify-between mb-2 gap-3">
							<h3 className="font-bold min-w-0 truncate">{open.subject || '(tanpa subjek)'}</h3>
							<button className="btn btn-ghost shrink-0" onClick={() => setOpen(null)}>Tutup</button>
						</div>
						<div className="text-sm opacity-70 mb-3 break-all">Dari: {open.from_addr}</div>
						{open.otp_code && <div className="pill text-tertiary mb-3">Kode: <b>{open.otp_code}</b> <button onClick={() => navigator.clipboard.writeText(open.otp_code)}><Copy size={12} /></button></div>}
						{open.body_html ? (
							<div className="prose prose-invert max-w-none overflow-auto" dangerouslySetInnerHTML={ { __html: open.body_html } } />
						) : (
							<pre className="whitespace-pre-wrap text-sm overflow-auto">{open.body_text}</pre>
						)}
					</div>
				</div>
			)}
		</main>
	)
}
