'use client'
// Multi-inbox: simpan beberapa alamat di localStorage + alamat aktif.

export interface SavedAddress {
	address: string
	ownerToken: string
	expiresAt: number
	domain: string
}

const KEY = 'tmailku.addresses'
const ACTIVE = 'tmailku.active'

export function getAddresses(): SavedAddress[] {
	if (typeof window === 'undefined') return []
	try {
		return JSON.parse(localStorage.getItem(KEY) || '[]')
	} catch {
		return []
	}
}

export function saveAddress(a: SavedAddress) {
	const list = getAddresses().filter((x) => x.address !== a.address)
	list.unshift(a)
	localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)))
	setActive(a.address)
}

export function removeAddress(address: string) {
	const list = getAddresses().filter((x) => x.address !== address)
	localStorage.setItem(KEY, JSON.stringify(list))
	if (getActive() === address) setActive(list[0]?.address || '')
}

export function getActive(): string {
	if (typeof window === 'undefined') return ''
	return localStorage.getItem(ACTIVE) || ''
}

export function setActive(address: string) {
	localStorage.setItem(ACTIVE, address)
}

// Tema
export function getTheme(): 'dark' | 'light' {
	if (typeof window === 'undefined') return 'dark'
	return (localStorage.getItem('tmailku.theme') as 'dark' | 'light') || 'dark'
}
export function setTheme(t: 'dark' | 'light') {
	localStorage.setItem('tmailku.theme', t)
	document.documentElement.setAttribute('data-theme', t)
}
