// Admin API: login, stats, activity, CRUD domains/imap/admins/settings/api-keys/integrations.
import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import type { Env, Variables } from '../types'
import { uid, now, hashPassword, verifyPassword, signJwt, sha256hex } from '../lib/util'
import { requireAdmin } from '../lib/auth'
import { getGroup, setSetting, getAllSettings } from '../lib/settings'
import { createApiKey } from '../lib/apikeys'
import { testConnection, type ImapConfig } from '../imap/client'
import { pollAccount } from '../imap/fetcher'
import { sendTestNotification } from '../lib/notify'
import { addLog } from '../lib/log'

export const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// ---------- AUTH ----------
adminRoutes.post('/login', async (c) => {
	const { email, password } = await c.req.json<{ email: string; password: string }>().catch(() => ({}) as any)
	const row = await c.env.DB.prepare('SELECT * FROM admins WHERE email = ?')
		.bind((email || '').trim().toLowerCase())
		.first<any>()
	if (!row || !(await verifyPassword(password || '', row.password_hash))) {
		return c.json({ error: 'email atau password salah' }, 401)
	}
	const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
	const token = await signJwt({ sub: row.id, email: row.email, role: row.role, exp }, c.env.JWT_SECRET)
	setCookie(c, 'tmk_session', token, {
		httpOnly: true,
		secure: true,
		sameSite: 'None',
		path: '/',
		maxAge: 60 * 60 * 24 * 7,
	})
	await addLog(c.env, 'info', 'auth', 'admin login: ' + row.email)
	return c.json({ ok: true, token, mustChangePassword: !!row.must_change_password })
})

adminRoutes.post('/logout', async (c) => {
	deleteCookie(c, 'tmk_session', { path: '/' })
	return c.json({ ok: true })
})

// semua route di bawah perlu admin
adminRoutes.use('*', requireAdmin)

adminRoutes.get('/me', async (c) => {
	const s = c.get('admin')!
	const row = await c.env.DB.prepare('SELECT id, email, name, avatar_url, role FROM admins WHERE id = ?')
		.bind(s.sub)
		.first<any>()
	return c.json(row || {})
})

// ---------- PROFIL ----------
adminRoutes.patch('/me', async (c) => {
	const s = c.get('admin')!
	const b = await c.req.json<any>().catch(() => ({}))
	if (b.name !== undefined) await c.env.DB.prepare('UPDATE admins SET name = ? WHERE id = ?').bind(b.name, s.sub).run()
	if (b.email) await c.env.DB.prepare('UPDATE admins SET email = ? WHERE id = ?').bind(String(b.email).toLowerCase(), s.sub).run()
	if (b.avatar_url !== undefined) await c.env.DB.prepare('UPDATE admins SET avatar_url = ? WHERE id = ?').bind(b.avatar_url, s.sub).run()
	if (b.password) await c.env.DB.prepare('UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?').bind(await hashPassword(b.password), s.sub).run()
	return c.json({ ok: true })
})

// ---------- OVERVIEW ----------
adminRoutes.get('/stats', async (c) => {
	const totalEmails = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM emails').first<{ n: number }>()
	const totalAddresses = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM addresses').first<{ n: number }>()
	const totalDomains = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM domains').first<{ n: number }>()
	const since = now() - 24 * 3600 * 1000
	const last24 = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM emails WHERE received_at > ?').bind(since).first<{ n: number }>()
	const { results: perDomain } = await c.env.DB.prepare(
		`SELECT d.domain AS domain, COUNT(e.id) AS count FROM domains d
		 LEFT JOIN addresses a ON a.domain_id = d.id
		 LEFT JOIN emails e ON e.address_id = a.id
		 GROUP BY d.id ORDER BY count DESC`,
	).all<any>()
	const { results: imap } = await c.env.DB.prepare(
		'SELECT label, username, enabled, last_sync_at, last_error FROM imap_accounts',
	).all<any>()
	return c.json({
		totals: {
			emails: totalEmails?.n ?? 0,
			addresses: totalAddresses?.n ?? 0,
			domains: totalDomains?.n ?? 0,
			emails24h: last24?.n ?? 0,
		},
		perDomain: perDomain ?? [],
		imapStatus: imap ?? [],
	})
})

// activity feed + log terminal
adminRoutes.get('/activity', async (c) => {
	const limit = Math.min(Number(c.req.query('limit') || '100'), 300)
	const { results } = await c.env.DB.prepare(
		'SELECT level, scope, message, created_at FROM logs ORDER BY created_at DESC LIMIT ?',
	)
		.bind(limit)
		.all<any>()
	return c.json({ events: results ?? [] })
})

// ---------- DOMAINS ----------
adminRoutes.get('/domains', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM domains ORDER BY created_at DESC').all<any>()
	return c.json({ domains: results ?? [] })
})

adminRoutes.post('/domains', async (c) => {
	const b = await c.req.json<any>().catch(() => ({}))
	const domain = (b.domain || '').trim().toLowerCase()
	if (!domain) return c.json({ error: 'domain wajib' }, 400)
	const id = uid('dom')
	await c.env.DB.prepare(
		"INSERT INTO domains (id, domain, source, status, verified, created_at) VALUES (?, ?, ?, 'active', 0, ?)",
	)
		.bind(id, domain, b.source || 'routing', now())
		.run()
	await addLog(c.env, 'info', 'domain', 'domain ditambah: ' + domain)
	return c.json({ ok: true, id })
})

adminRoutes.patch('/domains/:id', async (c) => {
	const id = c.req.param('id')
	const b = await c.req.json<any>().catch(() => ({}))
	const fields: string[] = []
	const vals: any[] = []
	for (const k of ['source', 'status', 'verified']) {
		if (b[k] !== undefined) {
			fields.push(k + ' = ?')
			vals.push(b[k])
		}
	}
	if (!fields.length) return c.json({ ok: true })
	vals.push(id)
	await c.env.DB.prepare('UPDATE domains SET ' + fields.join(', ') + ' WHERE id = ?').bind(...vals).run()
	return c.json({ ok: true })
})

// verifikasi domain (cek MX) untuk Custom Domain Wizard
adminRoutes.post('/domains/:id/verify', async (c) => {
	const row = await c.env.DB.prepare('SELECT domain FROM domains WHERE id = ?').bind(c.req.param('id')).first<any>()
	if (!row) return c.json({ error: 'not found' }, 404)
	let verified = false
	try {
		const r = await fetch('https://cloudflare-dns.com/dns-query?name=' + row.domain + '&type=MX', {
			headers: { accept: 'application/dns-json' },
		})
		const data = await r.json<any>()
		verified = Array.isArray(data.Answer) && data.Answer.some((a: any) => /mx\..*cloudflare|route\d?\.mx\.cloudflare/i.test(a.data || ''))
	} catch {}
	await c.env.DB.prepare('UPDATE domains SET verified = ? WHERE id = ?').bind(verified ? 1 : 0, c.req.param('id')).run()
	return c.json({ verified })
})

adminRoutes.delete('/domains/:id', async (c) => {
	await c.env.DB.prepare('DELETE FROM domains WHERE id = ?').bind(c.req.param('id')).run()
	return c.json({ ok: true })
})

// ---------- IMAP ACCOUNTS ----------
adminRoutes.get('/imap-accounts', async (c) => {
	const { results } = await c.env.DB.prepare(
		'SELECT id, label, hostname, port, encryption, username, folder, poll_interval, domain_id, enabled, last_sync_at, last_error FROM imap_accounts',
	).all<any>()
	return c.json({ accounts: results ?? [] })
})

adminRoutes.post('/imap-accounts', async (c) => {
	const b = await c.req.json<any>().catch(() => ({}))
	if (!b.hostname || !b.username || !b.password) return c.json({ error: 'hostname/username/password wajib' }, 400)
	const id = uid('imap')
	await c.env.DB.prepare(
		`INSERT INTO imap_accounts (id, label, hostname, port, encryption, username, password, folder, poll_interval, domain_id, enabled)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
	)
		.bind(
			id,
			b.label || b.hostname,
			b.hostname,
			b.port || 993,
			b.encryption || 'ssl',
			b.username,
			b.password,
			b.folder || 'INBOX',
			b.poll_interval || 120,
			b.domain_id || null,
		)
		.run()
	return c.json({ ok: true, id })
})

adminRoutes.patch('/imap-accounts/:id', async (c) => {
	const id = c.req.param('id')
	const b = await c.req.json<any>().catch(() => ({}))
	const fields: string[] = []
	const vals: any[] = []
	for (const k of ['label', 'hostname', 'port', 'encryption', 'username', 'password', 'folder', 'poll_interval', 'domain_id', 'enabled']) {
		if (b[k] !== undefined) {
			fields.push(k + ' = ?')
			vals.push(b[k])
		}
	}
	if (!fields.length) return c.json({ ok: true })
	vals.push(id)
	await c.env.DB.prepare('UPDATE imap_accounts SET ' + fields.join(', ') + ' WHERE id = ?').bind(...vals).run()
	return c.json({ ok: true })
})

adminRoutes.delete('/imap-accounts/:id', async (c) => {
	await c.env.DB.prepare('DELETE FROM imap_accounts WHERE id = ?').bind(c.req.param('id')).run()
	return c.json({ ok: true })
})

adminRoutes.post('/imap-accounts/:id/test', async (c) => {
	const row = await c.env.DB.prepare('SELECT * FROM imap_accounts WHERE id = ?').bind(c.req.param('id')).first<any>()
	if (!row) return c.json({ error: 'not found' }, 404)
	const cfg: ImapConfig = {
		hostname: row.hostname,
		port: row.port,
		encryption: row.encryption,
		username: row.username,
		password: row.password,
		folder: row.folder,
	}
	const res = await testConnection(cfg)
	return c.json(res)
})

adminRoutes.post('/imap-accounts/:id/sync', async (c) => {
	const row = await c.env.DB.prepare('SELECT * FROM imap_accounts WHERE id = ?').bind(c.req.param('id')).first<any>()
	if (!row) return c.json({ error: 'not found' }, 404)
	try {
		const count = await pollAccount(c.env, row)
		return c.json({ ok: true, fetched: count })
	} catch (e: any) {
		return c.json({ ok: false, error: String(e?.message || e) }, 500)
	}
})

// ---------- ADMINS ----------
adminRoutes.get('/admins', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT id, email, name, role, created_at FROM admins').all<any>()
	return c.json({ admins: results ?? [] })
})

adminRoutes.post('/admins', async (c) => {
	const b = await c.req.json<any>().catch(() => ({}))
	if (!b.email || !b.password) return c.json({ error: 'email & password wajib' }, 400)
	const id = uid('adm')
	await c.env.DB.prepare(
		'INSERT INTO admins (id, email, password_hash, name, role, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
	)
		.bind(id, String(b.email).toLowerCase(), await hashPassword(b.password), b.name || '', b.role || 'admin', now())
		.run()
	return c.json({ ok: true, id })
})

adminRoutes.delete('/admins/:id', async (c) => {
	const s = c.get('admin')!
	if (s.sub === c.req.param('id')) return c.json({ error: 'tidak bisa hapus diri sendiri' }, 400)
	await c.env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(c.req.param('id')).run()
	return c.json({ ok: true })
})

// ---------- SETTINGS (branding/security/system) ----------
adminRoutes.get('/settings', async (c) => {
	const group = c.req.query('group')
	if (group) return c.json({ settings: await getGroup(c.env, group) })
	return c.json({ settings: await getAllSettings(c.env) })
})

adminRoutes.put('/settings', async (c) => {
	const b = await c.req.json<Record<string, string>>().catch(() => ({}))
	for (const [k, v] of Object.entries(b)) {
		// lock password: simpan sebagai hash
		if (k === 'site_lock_password' && v) {
			await setSetting(c.env, 'site_lock_password_hash', await sha256hex(v))
			continue
		}
		await setSetting(c.env, k, String(v))
	}
	await addLog(c.env, 'info', 'settings', 'settings diperbarui')
	return c.json({ ok: true })
})

// ---------- UPLOAD ASET BRANDING (logo/favicon) ----------
adminRoutes.post('/upload', async (c) => {
	const form = await c.req.formData().catch(() => null)
	const file = form?.get('file')
	if (!(file instanceof File)) return c.json({ error: 'file tidak ditemukan' }, 400)
	if (file.size > 2 * 1024 * 1024) return c.json({ error: 'file terlalu besar (maks 2MB)' }, 400)
	const id = uid('brand')
	const buf = new Uint8Array(await file.arrayBuffer())
	await c.env.R2.put('brand/' + id, buf, { httpMetadata: { contentType: file.type || 'application/octet-stream' } })
	const origin = new URL(c.req.url).origin
	await addLog(c.env, 'info', 'settings', 'aset branding diupload')
	return c.json({ url: origin + '/api/asset/' + id })
})

// ---------- API KEYS ----------
adminRoutes.get('/api-keys', async (c) => {
	const { results } = await c.env.DB.prepare(
		'SELECT id, name, key_prefix, scopes, rate_limit, enabled, last_used_at, expires_at, created_at FROM api_keys ORDER BY created_at DESC',
	).all<any>()
	return c.json({ keys: results ?? [] })
})

adminRoutes.post('/api-keys', async (c) => {
	const b = await c.req.json<any>().catch(() => ({}))
	const created = await createApiKey(c.env, {
		name: b.name || 'key',
		scopes: b.scopes || ['address:create', 'inbox:read'],
		rate_limit: b.rate_limit || 60,
		expires_at: b.expires_at || null,
	})
	// plaintext hanya dikirim sekali
	return c.json(created)
})

adminRoutes.patch('/api-keys/:id', async (c) => {
	const b = await c.req.json<any>().catch(() => ({}))
	if (b.enabled !== undefined) await c.env.DB.prepare('UPDATE api_keys SET enabled = ? WHERE id = ?').bind(b.enabled ? 1 : 0, c.req.param('id')).run()
	if (b.rate_limit !== undefined) await c.env.DB.prepare('UPDATE api_keys SET rate_limit = ? WHERE id = ?').bind(b.rate_limit, c.req.param('id')).run()
	if (b.scopes !== undefined) await c.env.DB.prepare('UPDATE api_keys SET scopes = ? WHERE id = ?').bind(JSON.stringify(b.scopes), c.req.param('id')).run()
	return c.json({ ok: true })
})

adminRoutes.delete('/api-keys/:id', async (c) => {
	await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(c.req.param('id')).run()
	return c.json({ ok: true })
})

// ---------- INTEGRATIONS ----------
adminRoutes.get('/integrations', async (c) => {
	return c.json({ settings: await getGroup(c.env, 'integrations') })
})

adminRoutes.put('/integrations', async (c) => {
	const b = await c.req.json<Record<string, string>>().catch(() => ({}))
	for (const [k, v] of Object.entries(b)) await setSetting(c.env, k, String(v))
	return c.json({ ok: true })
})

adminRoutes.post('/integrations/test', async (c) => {
	return c.json(await sendTestNotification(c.env))
})
