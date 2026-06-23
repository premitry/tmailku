'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
	LayoutDashboard, Mail, Palette, ShieldCheck, KeyRound, Settings, Plug, LogOut, User, Plus, Trash2,
	RefreshCw, CheckCircle2, XCircle, Eye, EyeOff, Send, Globe,
} from 'lucide-react'
import { api } from '@/lib/api'

type Tab = 'overview' | 'sources' | 'appearance' | 'security' | 'api' | 'system' | 'integrations'

const NAV: { id: Tab; label: string; icon: any }[] = [
	{ id: 'overview', label: 'Overview', icon: LayoutDashboard },
	{ id: 'sources', label: 'Mail Sources', icon: Mail },
	{ id: 'appearance', label: 'Appearance', icon: Palette },
	{ id: 'security', label: 'Access & Security', icon: ShieldCheck },
	{ id: 'api', label: 'API', icon: KeyRound },
	{ id: 'integrations', label: 'Integrations', icon: Plug },
	{ id: 'system', label: 'System', icon: Settings },
]

export default function AdminPage() {
	const router = useRouter()
	const [tab, setTab] = useState<Tab>('overview')
	const [me, setMe] = useState<any>(null)
	const [showProfile, setShowProfile] = useState(false)

	useEffect(() => {
		api.me().then(setMe).catch(() => router.replace('/admin/login'))
	}, [router])

	async function logout() {
		await api.logout().catch(() => {})
		localStorage.removeItem('tmailku.token')
		router.replace('/admin/login')
	}

	return (
		<div className="flex min-h-screen">
			<aside className="w-56 p-4 border-r border-white/10 hidden md:block">
				<div className="font-bold text-lg mb-6 px-2">TMailku Admin</div>
				<nav className="space-y-1">
					{NAV.map((n) => (
						<button key={n.id} onClick={() => setTab(n.id)} className={'btn w-full justify-start ' + (tab === n.id ? 'btn-primary' : 'btn-ghost')}>
							<n.icon size={16} /> {n.label}
						</button>
					))}
				</nav>
			</aside>
			<main className="flex-1 p-5 max-w-4xl">
				<header className="flex items-center justify-between mb-6">
					<select className="md:hidden w-auto" value={tab} onChange={(e) => setTab(e.target.value as Tab)}>
						{NAV.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
					</select>
					<div className="font-semibold hidden md:block">{NAV.find((n) => n.id === tab)?.label}</div>
					<div className="relative">
						<button className="btn btn-ghost" onClick={() => setShowProfile((s) => !s)}>
							<User size={16} /> {me?.name || me?.email || 'Admin'}
						</button>
						{showProfile && (
							<div className="glass absolute right-0 mt-1 p-3 min-w-[240px] z-10">
								<ProfileMenu me={me} onSaved={() => api.me().then(setMe)} />
								<button className="btn btn-ghost w-full mt-2" onClick={logout}><LogOut size={14} /> Keluar</button>
							</div>
						)}
					</div>
				</header>
				{tab === 'overview' && <Overview />}
				{tab === 'sources' && <MailSources />}
				{tab === 'appearance' && <Appearance />}
				{tab === 'security' && <Security />}
				{tab === 'api' && <ApiKeys />}
				{tab === 'integrations' && <Integrations />}
				{tab === 'system' && <SystemTab />}
			</main>
		</div>
	)
}

function ProfileMenu({ me, onSaved }: { me: any; onSaved: () => void }) {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [show, setShow] = useState(false)
	useEffect(() => setEmail(me?.email || ''), [me])
	async function save() {
		await api.updateProfile({ email, ...(password ? { password } : {}) })
		setPassword('')
		onSaved()
		alert('Profil disimpan')
	}
	return (
		<div className="space-y-2">
			<div className="text-xs opacity-70">Ubah Profil</div>
			<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
			<div className="relative">
				<input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password baru" />
				<button type="button" className="absolute right-2 top-2.5" onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
			</div>
			<button className="btn btn-primary w-full" onClick={save}>Simpan</button>
		</div>
	)
}

function Card({ children }: { children: React.ReactNode }) {
	return <div className="glass p-4">{children}</div>
}

function Overview() {
	const [stats, setStats] = useState<any>(null)
	const [events, setEvents] = useState<any[]>([])
	useEffect(() => {
		const load = () => {
			api.stats().then(setStats).catch(() => {})
			api.activity().then((a) => setEvents(a.events)).catch(() => {})
		}
		load()
		const iv = setInterval(load, 10000)
		return () => clearInterval(iv)
	}, [])
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<Stat label="Email" value={stats?.totals?.emails} />
				<Stat label="Alamat" value={stats?.totals?.addresses} />
				<Stat label="Domain" value={stats?.totals?.domains} />
				<Stat label="Email 24 jam" value={stats?.totals?.emails24h} />
			</div>
			<Card>
				<div className="text-sm font-semibold mb-2">Status Mail Sources</div>
				{(stats?.imapStatus || []).length === 0 ? <div className="opacity-60 text-sm">Belum ada akun IMAP.</div> : (stats?.imapStatus || []).map((s: any, i: number) => (
					<div key={i} className="flex items-center justify-between text-sm py-1">
						<span>{s.label || s.username}</span>
						<span className="pill">{s.last_error ? <XCircle size={12} className="text-red-400" /> : <CheckCircle2 size={12} className="text-secondary" />} {s.last_error ? 'error' : 'ok'}</span>
					</div>
				))}
			</Card>
			<Card>
				<div className="text-sm font-semibold mb-2">Aktivitas / Log</div>
				<div className="mono text-xs bg-black/40 rounded-lg p-3 h-64 overflow-auto space-y-1">
					{events.length === 0 ? <div className="opacity-50">$ menunggu aktivitas...</div> : events.map((e, i) => (
						<div key={i}>
							<span className="opacity-40">{new Date(e.created_at).toLocaleTimeString()}</span>{' '}
							<span className={e.level === 'error' ? 'text-red-400' : e.level === 'warn' ? 'text-tertiary' : 'text-secondary'}>[{e.level}]</span>{' '}
							<span className="opacity-60">{e.scope}</span> {e.message}
						</div>
					))}
				</div>
			</Card>
		</div>
	)
}

function Stat({ label, value }: { label: string; value?: number }) {
	return <Card><div className="text-2xl font-bold">{value ?? '-'}</div><div className="text-sm opacity-60">{label}</div></Card>
}

function MailSources() {
	const [domains, setDomains] = useState<any[]>([])
	const [accounts, setAccounts] = useState<any[]>([])
	const [newDomain, setNewDomain] = useState('')
	const [src, setSrc] = useState('routing')
	const [imap, setImap] = useState<any>({ hostname: '', port: 993, encryption: 'ssl', username: '', password: '', folder: 'INBOX' })
	const [showPass, setShowPass] = useState(false)
	const [testResult, setTestResult] = useState<string>('')

	const load = () => {
		api.adminDomains().then((d) => setDomains(d.domains)).catch(() => {})
		api.imapAccounts().then((d) => setAccounts(d.accounts)).catch(() => {})
	}
	useEffect(load, [])

	return (
		<div className="space-y-4">
			<Card>
				<div className="flex items-center gap-2 font-semibold mb-3"><Globe size={16} /> Domains</div>
				<div className="flex gap-2 mb-3">
					<input placeholder="domain.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
					<select className="w-auto" value={src} onChange={(e) => setSrc(e.target.value)}>
						<option value="routing">CF Routing</option>
						<option value="imap">IMAP</option>
						<option value="both">Keduanya</option>
					</select>
					<button className="btn btn-primary" onClick={async () => { await api.addDomain({ domain: newDomain, source: src }); setNewDomain(''); load() }}><Plus size={16} /></button>
				</div>
				{domains.map((d) => (
					<div key={d.id} className="flex items-center justify-between py-2 border-t border-white/5">
						<div><span className="mono">{d.domain}</span> <span className="pill ml-2">{d.source}</span> {d.verified ? <span className="pill text-secondary">verified</span> : null}</div>
						<div className="flex gap-2">
							<button className="btn btn-ghost" onClick={async () => { await api.patchDomain(d.id, { status: d.status === 'active' ? 'disabled' : 'active' }); load() }}>{d.status === 'active' ? 'Aktif' : 'Nonaktif'}</button>
							<button className="btn btn-ghost" onClick={async () => { const r = await api.verifyDomain(d.id); alert(r.verified ? 'MX terverifikasi' : 'MX belum mengarah ke Cloudflare'); load() }}>Verify</button>
							<button className="btn btn-ghost" onClick={async () => { await api.delDomain(d.id); load() }}><Trash2 size={14} /></button>
						</div>
					</div>
				))}
			</Card>

			<Card>
				<div className="flex items-center gap-2 font-semibold mb-1"><Mail size={16} /> Akun IMAP</div>
				<p className="text-xs opacity-60 mb-3">Tarik email dari mailbox eksternal via IMAP (port 993 SSL). Password disimpan plaintext.</p>
				<div className="grid grid-cols-2 gap-2 mb-2">
					<input placeholder="Label" onChange={(e) => setImap({ ...imap, label: e.target.value })} />
					<input placeholder="Host (imap.gmail.com)" onChange={(e) => setImap({ ...imap, hostname: e.target.value })} />
					<input placeholder="Port" type="number" value={imap.port} onChange={(e) => setImap({ ...imap, port: Number(e.target.value) })} />
					<select value={imap.encryption} onChange={(e) => setImap({ ...imap, encryption: e.target.value })}>
						<option value="ssl">SSL/TLS</option>
						<option value="starttls">STARTTLS</option>
						<option value="none">None</option>
					</select>
					<input placeholder="Username" onChange={(e) => setImap({ ...imap, username: e.target.value })} />
					<div className="relative">
						<input placeholder="Password" type={showPass ? 'text' : 'password'} onChange={(e) => setImap({ ...imap, password: e.target.value })} />
						<button type="button" className="absolute right-2 top-2.5" onClick={() => setShowPass((s) => !s)}>{showPass ? <EyeOff size={14} /> : <Eye size={14} />}</button>
					</div>
				</div>
				<button className="btn btn-primary" onClick={async () => { await api.addImap(imap); load() }}><Plus size={16} /> Tambah Akun</button>
				{testResult && <div className="text-sm mt-2">{testResult}</div>}
				<div className="mt-3 space-y-2">
					{accounts.map((a) => (
						<div key={a.id} className="flex items-center justify-between py-2 border-t border-white/5">
							<div><span className="mono">{a.label || a.username}</span> <span className="pill ml-2">{a.encryption}</span>{a.last_error && <span className="pill text-red-400 ml-1">err</span>}</div>
							<div className="flex gap-2">
								<button className="btn btn-ghost" onClick={async () => { const r = await api.testImap(a.id); setTestResult(r.ok ? '✅ Koneksi ' + (a.label || a.username) + ' OK' : '❌ ' + r.error) }}>Test</button>
								<button className="btn btn-ghost" onClick={async () => { const r = await api.syncImap(a.id); alert('Sync: ' + (r.fetched ?? 0) + ' email'); }}><RefreshCw size={14} /></button>
								<button className="btn btn-ghost" onClick={async () => { await api.delImap(a.id); load() }}><Trash2 size={14} /></button>
							</div>
						</div>
					))}
				</div>
			</Card>
		</div>
	)
}

function Appearance() {
	const [s, setS] = useState<Record<string, string>>({})
	const [busy, setBusy] = useState('')
	useEffect(() => { api.settings('branding').then((r) => setS(flat(r.settings))).catch(() => {}) }, [])
	const set = (k: string, v: string) => setS((p) => ({ ...p, [k]: v }))
	async function upload(key: string, file?: File | null) {
		if (!file) return
		setBusy(key)
		try {
			const { url } = await api.upload(file)
			set(key, url)
		} catch (e: any) { alert(e.message) } finally { setBusy('') }
	}
	return (
		<Card>
			<div className="space-y-3">
				<Field label="Nama Aplikasi"><input value={s.app_name || ''} onChange={(e) => set('app_name', e.target.value)} /></Field>
				<Field label="Judul Hero"><input value={s.hero_title || ''} placeholder="Email Sementara, Instan & Privat" onChange={(e) => set('hero_title', e.target.value)} /></Field>
				<Field label="Subjudul Hero"><textarea rows={2} value={s.hero_subtitle || ''} placeholder="Terima email tanpa registrasi. Auto-hapus otomatis." onChange={(e) => set('hero_subtitle', e.target.value)} /></Field>
				<Field label="Logo (upload gambar)">
					<div className="flex items-center gap-3">
						{s.logo_url && <img src={s.logo_url} alt="logo" className="h-10 w-10 object-contain rounded glass p-1" />}
						<input type="file" accept="image/*" className="!w-auto" onChange={(e) => upload('logo_url', e.target.files?.[0])} />
						{busy === 'logo_url' && <span className="text-sm opacity-60">Mengupload...</span>}
						{s.logo_url && <button className="btn btn-ghost" onClick={() => set('logo_url', '')}><Trash2 size={14} /></button>}
					</div>
				</Field>
				<Field label="Favicon (upload gambar)">
					<div className="flex items-center gap-3">
						{s.favicon_url && <img src={s.favicon_url} alt="favicon" className="h-8 w-8 object-contain rounded glass p-1" />}
						<input type="file" accept="image/*" className="!w-auto" onChange={(e) => upload('favicon_url', e.target.files?.[0])} />
						{busy === 'favicon_url' && <span className="text-sm opacity-60">Mengupload...</span>}
						{s.favicon_url && <button className="btn btn-ghost" onClick={() => set('favicon_url', '')}><Trash2 size={14} /></button>}
					</div>
				</Field>
				<div className="grid grid-cols-2 gap-2">
					<Field label="Tema Default"><select value={s.default_theme || 'dark'} onChange={(e) => set('default_theme', e.target.value)}><option value="dark">Gelap</option><option value="light">Terang</option></select></Field>
					<Field label="Bahasa Default"><select value={s.default_lang || 'id'} onChange={(e) => set('default_lang', e.target.value)}><option value="id">Indonesia</option><option value="en">English</option></select></Field>
				</div>
				<button className="btn btn-primary" onClick={async () => { await api.saveSettings(s); alert('Tersimpan') }}>Simpan</button>
			</div>
		</Card>
	)
}

function Security() {
	const [s, setS] = useState<Record<string, string>>({})
	const [admins, setAdmins] = useState<any[]>([])
	const [na, setNa] = useState<any>({ email: '', password: '', name: '' })
	const load = () => {
		api.settings('security').then((r) => setS(flat(r.settings))).catch(() => {})
		api.admins().then((r) => setAdmins(r.admins)).catch(() => {})
	}
	useEffect(load, [])
	const set = (k: string, v: string) => setS({ ...s, [k]: v })
	return (
		<div className="space-y-4">
			<Card>
				<div className="font-semibold mb-2">Lock Website</div>
				<Field label="Kunci akses publik"><select value={s.site_locked || 'false'} onChange={(e) => set('site_locked', e.target.value)}><option value="false">Tidak</option><option value="true">Ya (perlu password)</option></select></Field>
				<Field label="Password Lock"><input placeholder="(kosongkan jika tak diubah)" onChange={(e) => set('site_lock_password', e.target.value)} /></Field>
				<button className="btn btn-primary mt-2" onClick={async () => { await api.saveSettings(s); alert('Tersimpan') }}>Simpan</button>
			</Card>
			<Card>
				<div className="font-semibold mb-2">Admin</div>
				<div className="grid grid-cols-3 gap-2 mb-2">
					<input placeholder="Nama" onChange={(e) => setNa({ ...na, name: e.target.value })} />
					<input placeholder="Email" onChange={(e) => setNa({ ...na, email: e.target.value })} />
					<input placeholder="Password" type="password" onChange={(e) => setNa({ ...na, password: e.target.value })} />
				</div>
				<button className="btn btn-primary" onClick={async () => { await api.addAdmin(na); load() }}><Plus size={14} /> Tambah Admin</button>
				<div className="mt-3">
					{admins.map((a) => (
						<div key={a.id} className="flex items-center justify-between py-2 border-t border-white/5">
							<span>{a.name || a.email} <span className="pill ml-2">{a.role}</span></span>
							<button className="btn btn-ghost" onClick={async () => { await api.delAdmin(a.id); load() }}><Trash2 size={14} /></button>
						</div>
					))}
				</div>
			</Card>
		</div>
	)
}

function ApiKeys() {
	const [s, setS] = useState<Record<string, string>>({})
	const [keys, setKeys] = useState<any[]>([])
	const [name, setName] = useState('')
	const [created, setCreated] = useState<string>('')
	const load = () => {
		api.settings('api').then((r) => setS(flat(r.settings))).catch(() => {})
		api.apiKeys().then((r) => setKeys(r.keys)).catch(() => {})
	}
	useEffect(load, [])
	return (
		<div className="space-y-4">
			<Card>
				<Field label="Aktifkan API publik"><select value={s.api_enabled || 'false'} onChange={(e) => { const v = e.target.value; setS({ ...s, api_enabled: v }); api.saveSettings({ api_enabled: v }) }}><option value="true">Aktif</option><option value="false">Nonaktif</option></select></Field>
			</Card>
			<Card>
				<div className="font-semibold mb-2">API Keys</div>
				<div className="flex gap-2 mb-2">
					<input placeholder="Nama key" value={name} onChange={(e) => setName(e.target.value)} />
					<button className="btn btn-primary" onClick={async () => { const r = await api.addApiKey({ name }); setCreated(r.plaintext); setName(''); load() }}><Plus size={16} /> Buat</button>
				</div>
				{created && <div className="glass p-2 text-sm mono break-all mb-2">Simpan sekarang (hanya tampil sekali):<br />{created}</div>}
				{keys.map((k) => (
					<div key={k.id} className="flex items-center justify-between py-2 border-t border-white/5">
						<span>{k.name} <span className="pill mono ml-2">{k.key_prefix}…</span> {k.enabled ? '' : <span className="pill text-red-400">off</span>}</span>
						<div className="flex gap-2">
							<button className="btn btn-ghost" onClick={async () => { await api.patchApiKey(k.id, { enabled: !k.enabled }); load() }}>{k.enabled ? 'Disable' : 'Enable'}</button>
							<button className="btn btn-ghost" onClick={async () => { await api.delApiKey(k.id); load() }}><Trash2 size={14} /></button>
						</div>
					</div>
				))}
				<a className="btn btn-ghost mt-3" href={(process.env.NEXT_PUBLIC_API_BASE || '') + '/docs'} target="_blank" rel="noreferrer">Lihat Dokumentasi API</a>
			</Card>
		</div>
	)
}

function Integrations() {
	const [s, setS] = useState<Record<string, string>>({})
	useEffect(() => { api.integrations().then((r) => setS(flat(r.settings))).catch(() => {}) }, [])
	const set = (k: string, v: string) => setS({ ...s, [k]: v })
	return (
		<Card>
			<div className="space-y-3">
				<div className="font-semibold">Telegram Bot</div>
				<Field label="Bot Token"><input value={s.telegram_bot_token || ''} onChange={(e) => set('telegram_bot_token', e.target.value)} /></Field>
				<Field label="Chat ID"><input value={s.telegram_chat_id || ''} onChange={(e) => set('telegram_chat_id', e.target.value)} /></Field>
				<div className="font-semibold pt-2">Webhook</div>
				<Field label="Aktifkan Webhook"><select value={s.webhook_enabled || 'false'} onChange={(e) => set('webhook_enabled', e.target.value)}><option value="true">Aktif</option><option value="false">Nonaktif</option></select></Field>
				<Field label="Webhook URL"><input value={s.webhook_url || ''} onChange={(e) => set('webhook_url', e.target.value)} /></Field>
				<div className="flex gap-2">
					<button className="btn btn-primary" onClick={async () => { await api.saveIntegrations(s); alert('Tersimpan') }}>Simpan</button>
					<button className="btn btn-ghost" onClick={async () => { const r = await api.testIntegration(); alert('Telegram: ' + (r.telegram ? 'OK' : '-') + ' | Webhook: ' + (r.webhook ? 'OK' : '-')) }}><Send size={14} /> Tes Notifikasi</button>
				</div>
			</div>
		</Card>
	)
}

function SystemTab() {
	const [s, setS] = useState<Record<string, string>>({})
	useEffect(() => { api.settings('system').then((r) => setS(flat(r.settings))).catch(() => {}) }, [])
	const set = (k: string, v: string) => setS({ ...s, [k]: v })
	return (
		<Card>
			<p className="text-xs opacity-60 mb-3">Pengaturan teknis: masa berlaku alamat, batas ukuran lampiran, rate limit, dan format alamat.</p>
			<div className="space-y-3">
				<Field label="TTL alamat (menit)"><input type="number" value={s.ttl_minutes || '60'} onChange={(e) => set('ttl_minutes', e.target.value)} /></Field>
				<Field label="Maks lampiran (MB)"><input type="number" value={s.max_attachment_mb || '10'} onChange={(e) => set('max_attachment_mb', e.target.value)} /></Field>
				<Field label="Rate limit global (/menit)"><input type="number" value={s.global_rate_limit || '120'} onChange={(e) => set('global_rate_limit', e.target.value)} /></Field>
				<Field label="Format alamat"><select value={s.address_format || 'word+num'} onChange={(e) => set('address_format', e.target.value)}><option value="word+num">kata+angka</option><option value="random">acak</option></select></Field>
				<Field label="Blocklist pengirim (pisahkan koma)"><input value={s.blocklist_senders || ''} onChange={(e) => set('blocklist_senders', e.target.value)} /></Field>
				<button className="btn btn-primary" onClick={async () => { await api.saveSettings(s); alert('Tersimpan') }}>Simpan</button>
			</div>
		</Card>
	)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return <div><label className="text-sm opacity-70">{label}</label>{children}</div>
}

function flat(settings: any): Record<string, string> {
	if (Array.isArray(settings)) {
		const o: Record<string, string> = {}
		for (const r of settings) o[r.key] = r.value ?? ''
		return o
	}
	return settings || {}
}
