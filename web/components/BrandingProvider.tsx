'use client'
import { useEffect } from 'react'
import { api, type Branding } from '@/lib/api'
import { getTheme, setTheme } from '@/lib/store'

export default function BrandingProvider({ onLoad }: { onLoad?: (b: Branding) => void }) {
	useEffect(() => {
		setTheme(getTheme())
		api
			.branding()
			.then((b) => {
				if (b.appName) document.title = b.appName + ' — Temporary Mail'
				if (b.faviconUrl) {
					let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
					if (!link) {
						link = document.createElement('link')
						link.rel = 'icon'
						document.head.appendChild(link)
					}
					link.href = b.faviconUrl
				}
				onLoad?.(b)
			})
			.catch(() => {})
	}, [onLoad])
	return null
}
