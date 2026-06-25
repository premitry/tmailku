// Minimal IMAP client via cloudflare:sockets (TLS port 993).
// Mendukung: login, select, UID search unseen sejak last_uid, fetch, parse via postal-mime.
// Catatan: Worker hanya bisa jadi IMAP *client* (outbound), bukan server.
import { connect } from 'cloudflare:sockets'

export interface ImapConfig {
	hostname: string
	port: number
	encryption: 'ssl' | 'starttls' | 'none'
	username: string
	password: string
	folder: string
}

export interface FetchedMessage {
	uid: number
	raw: Uint8Array
}

export class ImapClient {
	private socket: any
	private writer: WritableStreamDefaultWriter<Uint8Array>
	private reader: ReadableStreamDefaultReader<Uint8Array>
	private buffer = ''
	// rawChunks menyimpan semua bytes yang diterima untuk keperluan fetch binary-safe
	private rawChunks: Uint8Array[] = []
	private rawBytesLen = 0
	private tag = 0
	private dec = new TextDecoder()
	private encu = new TextEncoder()

	constructor(private cfg: ImapConfig) {}

	async connect(): Promise<void> {
		const secure = this.cfg.encryption === 'ssl'
		this.socket = connect(
			{ hostname: this.cfg.hostname, port: this.cfg.port },
			{ secureTransport: secure ? 'on' : 'starttls', allowHalfOpen: false },
		)
		this.writer = this.socket.writable.getWriter()
		this.reader = this.socket.readable.getReader()
		await this.readUntil('* OK') // greeting
		if (this.cfg.encryption === 'starttls') {
			await this.command('STARTTLS')
			this.socket = this.socket.startTls()
			this.writer = this.socket.writable.getWriter()
			this.reader = this.socket.readable.getReader()
		}
	}

	private async send(line: string): Promise<void> {
		await this.writer.write(this.encu.encode(line + '\r\n'))
	}

	private async readUntil(marker: string, timeoutMs = 15000): Promise<string> {
		const deadline = Date.now() + timeoutMs
		while (!this.buffer.includes(marker)) {
			if (Date.now() > deadline) throw new Error('IMAP read timeout waiting for: ' + marker)
			const { value, done } = await this.reader.read()
			if (done) break
			if (value) {
				this.rawChunks.push(value)
				this.rawBytesLen += value.byteLength
			}
			this.buffer += this.dec.decode(value, { stream: true })
		}
		const out = this.buffer
		return out
	}

	// Kirim tagged command, tunggu sampai tag selesai (OK/NO/BAD).
	private async command(cmd: string): Promise<string> {
		const tag = 'A' + String(++this.tag).padStart(4, '0')
		this.buffer = ''
		this.rawChunks = []
		this.rawBytesLen = 0
		await this.send(tag + ' ' + cmd)
		const deadline = Date.now() + 20000
		const re = new RegExp('^' + tag + ' (OK|NO|BAD)', 'm')
		while (!re.test(this.buffer)) {
			if (Date.now() > deadline) throw new Error('IMAP command timeout: ' + cmd)
			const { value, done } = await this.reader.read()
			if (done) break
			if (value) {
				this.rawChunks.push(value)
				this.rawBytesLen += value.byteLength
			}
			this.buffer += this.dec.decode(value, { stream: true })
		}
		const m = this.buffer.match(re)
		if (m && m[1] !== 'OK') throw new Error('IMAP ' + m[1] + ': ' + cmd)
		return this.buffer
	}

	// Gabungkan rawChunks menjadi satu Uint8Array
	private getRawBuffer(): Uint8Array {
		if (this.rawChunks.length === 0) return new Uint8Array(0)
		if (this.rawChunks.length === 1) return this.rawChunks[0]
		const out = new Uint8Array(this.rawBytesLen)
		let offset = 0
		for (const chunk of this.rawChunks) {
			out.set(chunk, offset)
			offset += chunk.byteLength
		}
		return out
	}

	async login(): Promise<void> {
		await this.command('LOGIN "' + this.cfg.username + '" "' + this.cfg.password.replace(/"/g, '\\"') + '"')
	}

	async selectFolder(): Promise<void> {
		await this.command('SELECT "' + (this.cfg.folder || 'INBOX') + '"')
	}

	// UID dari pesan dengan UID > sinceUid
	async searchSince(sinceUid: number): Promise<number[]> {
		const from = sinceUid > 0 ? sinceUid + 1 : 1
		const res = await this.command('UID SEARCH UID ' + from + ':*')
		const line = res.split('\r\n').find((l) => l.startsWith('* SEARCH'))
		if (!line) return []
		const nums = line
			.replace('* SEARCH', '')
			.trim()
			.split(/\s+/)
			.map((n) => parseInt(n, 10))
			.filter((n) => Number.isFinite(n) && n > sinceUid)
		return nums
	}

	async fetchMessage(uid: number): Promise<Uint8Array | null> {
		const res = await this.command('UID FETCH ' + uid + ' (BODY.PEEK[])')
		// Cari literal {size}\r\n<payload> di teks
		const idx = res.indexOf('{')
		if (idx === -1) return null
		const sizeMatch = res.slice(idx).match(/^\{(\d+)\}\r\n/)
		if (!sizeMatch) return null
		const size = parseInt(sizeMatch[1], 10)

		// Hitung byte-offset dari raw buffer agar binary-safe (tidak rusak charset non-UTF8)
		const headerText = res.slice(0, idx + sizeMatch[0].length)
		const headerBytes = this.encu.encode(headerText).byteLength
		const rawBuf = this.getRawBuffer()

		// Jika raw buffer cukup, ambil langsung dari sana (binary-safe)
		if (rawBuf.byteLength >= headerBytes + size) {
			return rawBuf.slice(headerBytes, headerBytes + size)
		}

		// Fallback: re-encode dari string (UTF8-safe email saja)
		const textStart = idx + sizeMatch[0].length
		const payload = res.slice(textStart, textStart + size)
		return this.encu.encode(payload)
	}

	async logout(): Promise<void> {
		try {
			await this.command('LOGOUT')
		} catch {}
		try {
			await this.writer.close()
		} catch {}
		try {
			await this.socket.close()
		} catch {}
	}
}

export async function testConnection(cfg: ImapConfig): Promise<{ ok: boolean; error?: string }> {
	const client = new ImapClient(cfg)
	try {
		await client.connect()
		await client.login()
		await client.selectFolder()
		await client.logout()
		return { ok: true }
	} catch (e: any) {
		return { ok: false, error: String(e?.message || e) }
	}
}
