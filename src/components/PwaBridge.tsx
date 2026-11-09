'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'lexica:install-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  return /iPhone|iPad|iPod/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
}

/**
 * App-installing plumbing for Lexica:
 *  - registers the service worker (production only, so dev never serves
 *    stale cached pages)
 *  - shows an install banner: a native "Install" button where the browser
 *    supports beforeinstallprompt, and Share -> Add to Home Screen
 *    instructions on iOS Safari
 */
export default function PwaBridge() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosReady, setIosReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (isStandalone()) return
    if (window.localStorage.getItem(DISMISS_KEY) === '1') return

    if (isIosSafari()) {
      // Small delay so the banner doesn't fight the first paint.
      const t = window.setTimeout(() => setIosReady(true), 1800)
      return () => window.clearTimeout(t)
    }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const visible = !dismissed && !installed && (iosReady || deferred !== null)

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore quota/private-mode errors
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }, [deferred])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Install Lexica"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-stone-200 bg-white p-4 pr-10 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute right-2 top-2 rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        {deferred ? (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#b32500] text-white">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">Install Lexica</p>
              <p className="mt-0.5 text-sm text-stone-500">
                Add the ad-free dictionary to your home screen for quick, full-screen lookups.
              </p>
              <button
                onClick={install}
                className="mt-2.5 rounded-full bg-[#b32500] px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Install
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Share className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">Add Lexica to your Home Screen</p>
              <p className="mt-0.5 text-sm text-stone-500">
                Tap the <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" /> Share
                button, then choose <b>Add to Home Screen</b> to install the app.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
