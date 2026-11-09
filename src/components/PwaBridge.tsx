'use client'

import { useEffect } from 'react'

/**
 * Registers Lexica's service worker (offline shell + cached lookups) so the
 * app is installable. Deliberately shows no install banner or popup — the
 * browser's own install affordance (address bar / Share > Add to Home Screen)
 * is enough.
 */
export default function PwaBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  return null
}
