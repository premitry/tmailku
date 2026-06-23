'use client'
import { useCallback, useEffect, useState } from 'react'
import { Copy, RefreshCw, Trash2, Plus, Mail, ChevronDown, Check, ShieldCheck, Zap, Clock, Pencil } from 'lucide-react'
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
	const [showCustom, setShowCustom] = useState(false)
	const [customLocal, setCustomLocal] = useState('')
	const [customDomain, setCustomDomain] = useState('')

	const refresh = useCallback(async (addr: string) => {
		if (!addr) return
		try {
			const { emails } = await api.inbox(addr)
			setEmails(emails)
		} catch {}
	}, [])

	useEffect(() => {
		setAddresses(getAddresses())
		setActiveAddr(getActive())
		api.domains().then((d) => {
			setDomains(d.domains)
			if (d.domains[0]) setCustomDomain(d.domains[0])
		}).catch(() => {})
	}, [])

	useEffect(() => {
		if (!active) return
		refresh(active)
		const es = new EventSource((process.env.NEXT_PUBLIC_API_BASE || '') + '/api/stream/' + encodeURIComponent(active))
		es.addEventListener('new', () => refresh(active))
		const iv = setInterval(() => refresh(active), 15000)
		return () => {
			es.close()
			clearInterval(iv)
		}
	}, [active, refresh])

	async function generate(opts: { domain?: string; local?: string } = {}) {
		setLoading(true)
		try {
			const r = await api.createAddress(opts)
			const saved: SavedAddress = { address: r.address, ownerToken: r.ownerToken, expiresAt: r.expiresAt, domain: r.domain }
			saveAddress(saved)
			setAddresses(getAddresses())
			setActiveAddr(r.address)
			setShowCustom(false)
			setCustomLocal('')
			setShowSwitcher(false)
		} catch (e: any) {
			alert(e.message)
		} finally {
			setLoading(false)
		}
	}

	function submitCustom() {
		if (!customLocal) return
		generate({ local: customLocal, domain: domains.length > 1 ? customDomain : domains[0] })
	}

	function copy() {
		navigator.clipboard.writeText(active)
		setCopied(true)
		setTimeout(() => setCopied(false), 1500)
	}

	async function openEmail(id: string) {
		const full = await api.email(id)
		setOpen(full)
		refresh(active)
	}

	const activeDomain = domains.length > 1 ? customDomain : (domains[0] || '')

	return (
		<main className="max-w-5xl mx-auto px-4 py-6">
			<BrandingProvider onLoad={setBranding} />
			{/* Header */}
			<header className="flex items-center justify-between mb-8">
				<div className="flex items-center gap-2 font-bold text-lg">
					{branding?.logoUrl ? <img src={branding.logoUrl} alt="" className="h-7 w-7 object-contain" /> : <Zap className="text-primary" />} {branding?.appName || 'TMailku'}
				</div>
				<div className="flex items-center gap-2">
					<a className="btn btn-ghost" href={(process.env.NEXT_PUBLIC_API_BASE || '') + '/docs'} target="_blank" rel="noreferrer">API</a>
					<ThemeToggle />
				</div>
			</header>

			{/* Hero */}
			<section className="text-center mb-8">
				<h1 className="text-4xl font-extrabold mb-3">{branding?.heroTitle || 'Email Sementara, Instan & Privat'}</h1>
				<p className="opacity-70 mb-4">{branding?.heroSubtitle || 'Terima email tanpa registrasi. Auto-hapus otomatis.'}</p>
				<div className="flex gap-2 justify-center flex-wrap">
					<span className="pill"><ShieldCheck size={14} /> Private</span>
					<span className="pill"><Zap size={14} /> Real-time</span>
					<span className="pill"><Clock size={14} /> Auto-expire</span>
				</div>
			</section>

			{/* Kartu alamat + switcher multi-inbox */}
			<div className="glass p-5 mb-6">
				{active ? (
					<div className="flex items-center justify-between gap-3 flex-wrap">
						<div className="relative min-w-0">
							<button className="btn btn-ghost mono text-base max-w-full" onClick={() => setShowSwitcher((s) => !s)}>
								<span className="truncate">{active}</span> <ChevronDown size={14} className="shrink-0" />
							</button>
							{showSwitcher && (
								<div className="popover absolute z-30 mt-1 p-2 min-w-[280px] max-w-[90vw]">
									{addresses.map((a) => (
										<div key={a.address} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10">
											<button className="mono text-sm text-left flex-1 truncate" onClick={() => { setActive(a.address); setActiveAddr(a.address); setShowSwitcher(false) }}>{a.address}</button>
											<button className="shrink-0 opacity-70 hover:opacity-100" onClick={() => { removeAddress(a.address); setAddresses(getAddresses()); setActiveAddr(getActive()) }}><Trash2 size={14} /></button>
										</div>
									))}
									<button className="btn btn-ghost w-full mt-2" onClick={() => generate()}><Plus size={14} /> Alamat acak</button>
									<button className="btn btn-ghost w-full mt-1" onClick={() => { setShowSwitcher(false); setShowCustom(true) }}><Pencil size={14} /> Custom email</button>
								</div>
							)}
						</div>
						<div className="grid grid-cols-2 gap-2">
							<button className="btn btn-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} Copy</button>
							<button className="btn btn-ghost" onClick={() => refresh(active)}><RefreshCw size={16} /> Refresh</button>
							<button className="btn btn-ghost" onClick={() => setShowCustom((s) => !s)}><Pencil size={16} /> Custom</button>
							<button className="btn btn-ghost" onClick={() => { removeAddress(active); setAddresses(getAddresses()); setActiveAddr(getActive()) }}><Trash2 size={16} /> Hapus</button>
						</div>
					</div>
				) : (
					<div className="text-center">
						<div className="flex gap-2 justify-center flex-wrap">
							<button className="btn btn-primary" disabled={loading} onClick={() => generate()}>
								<Plus size={16} /> {loading ? 'Membuat...' : 'Buat Alamat'}
							</button>
							<button className="btn btn-ghost" onClick={() => setShowCustom((s) => !s)}><Pencil size={16} /> Custom</button>
						</div>
					</div>
				)}

				{/* Form custom email */}
				{showCustom && (
					<div className="mt-4 pt-4" style={ { borderTop: '1px solid var(--border)' } }>
						<label className="text-sm opacity-70 mb-2 block">Buat email custom</label>
						<div className="flex gap-2 flex-wrap items-center">
							<input
								className="flex-1 min-w-[120px] mono"
								placeholder="namaku"
								value={customLocal}
								onChange={(e) => setCustomLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
								onKeyDown={(e) => { if (e.key === 'Enter') submitCustom() }}
							/>
							<span className="opacity-60">@</span>
							{domains.length > 1 ? (
								<select className="!w-auto mono" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)}>
									{domains.map((d) => <option key={d} value={d}>{d}</option>)}
								</select>
							) : (
								<span className="mono opacity-80">{domains[0] || '...'}</span>
							)}
							<button className="btn btn-primary shrink-0" disabled={loading || !customLocal} onClick={submitCustom}>{loading ? '...' : 'Buat'}</button>
						</div>
						{customLocal && <div className="mono text-sm opacity-60 mt-2">{customLocal}@{activeDomain}</div>}
					</div>
				)}
			</div>

			{/* Panel Messages */}
			<div className="glass p-5">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2 font-semibold"><Mail size={18} /> Kotak Masuk <span className="pill">{emails.length}</span></div>
					<span className="pill"><span className="live-dot w-2 h-2 rounded-full bg-secondary inline-block" /> Live</span>
				</div>
				{emails.length === 0 ? (
					<div className="text-center opacity-60 py-12"><Mail size={40} className="mx-auto mb-2" /> Kotak masuk kosong</div>
				) : (
					<div className="space-y-2">
						{emails.map((e) => (
							<button key={e.id} onClick={() => openEmail(e.id)} className="glass w-full text-left p-3 flex items-center justify-between">
								<div className="min-w-0">
									<div className="font-medium truncate">{e.from_name || e.from_addr}</div>
									<div className="text-sm opacity-70 truncate">{e.subject || '(tanpa subjek)'}</div>
								</div>
								{e.otp_code && <span className="pill text-tertiary" onClick={(ev) => { ev.stopPropagation(); navigator.clipboard.writeText(e.otp_code!) }}>OTP {e.otp_code}</span>}
							</button>
						))}
					</div>
				)}
			</div>

			{/* Email viewer */}
			{open && (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-40" onClick={() => setOpen(null)}>
					<div className="popover max-w-2xl w-full p-5 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
						<div className="flex items-center justify-between mb-2">
							<h3 className="font-bold">{open.subject || '(tanpa subjek)'}</h3>
							<button className="btn btn-ghost" onClick={() => setOpen(null)}>Tutup</button>
						</div>
						<div className="text-sm opacity-70 mb-3">Dari: {open.from_addr}</div>
						{open.otp_code && <div className="pill text-tertiary mb-3">Kode: <b>{open.otp_code}</b> <button onClick={() => navigator.clipboard.writeText(open.otp_code)}><Copy size={12} /></button></div>}
						{open.body_html ? (
							<div dangerouslySetInnerHTML={ { __html: open.body_html } } />
						) : (
							<pre className="whitespace-pre-wrap text-sm">{open.body_text}</pre>
						)}
					</div>
				</div>
			)}
		</main>
	)
}
