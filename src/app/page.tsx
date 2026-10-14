'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Volume2,
  BookOpen,
  Sparkles,
  History,
  Trash2,
  ArrowRight,
  Loader2,
  Calendar,
  Layers,
  Network,
  Languages,
  Quote,
  Lightbulb,
  AudioLines,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'

interface Definition {
  definition: string
  example?: string
  synonyms?: string[]
  antonyms?: string[]
}

interface DictionaryEntry {
  word: string
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
  partOfSpeech: string
  definitions: Definition[]
  synonyms?: string[]
  antonyms?: string[]
  etymology?: string
  origin?: string
  firstKnownUse?: string
  rhymes?: string[]
  inContext?: string
  didYouKnow?: string
  audioUrl?: string
  source?: 'merriam-webster' | 'wiktionary' | 'ai-fallback'
}

interface LookupError {
  error: string
  suggestions?: string[]
}

const RECENT_KEY = 'webster-free:recent'
const RECENT_LIMIT = 8

function loadRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((w) => typeof w === 'string') : []
  } catch {
    return []
  }
}

function saveRecent(words: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(words.slice(0, RECENT_LIMIT)))
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [entry, setEntry] = useState<DictionaryEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)

  const [wod, setWod] = useState<DictionaryEntry | null>(null)
  const [wodLoading, setWodLoading] = useState(true)
  const [wodError, setWodError] = useState<string | null>(null)
  const [wodDateKey, setWodDateKey] = useState('')

  const [recent, setRecent] = useState<string[]>([])
  const { toast } = useToast()

  const resultRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Load recent searches once on mount
  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  // Fetch Word of the Day (cached for the calendar day in localStorage)
  useEffect(() => {
    const key = `webster-free:wod:v5:${todayKey()}`
    let cancelled = false

    async function fetchWod() {
      const cached = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as DictionaryEntry
          if (parsed && parsed.word && Array.isArray(parsed.definitions)) {
            setWod(parsed)
            setWodDateKey(todayKey())
            setWodLoading(false)
            return
          }
        } catch {
          // ignore and refetch
        }
      }

      setWodLoading(true)
      try {
        const res = await fetch('/api/word-of-the-day', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to fetch')
        const data = (await res.json()) as DictionaryEntry
        if (cancelled) return
        setWod(data)
        setWodDateKey(todayKey())
        try {
          window.localStorage.setItem(key, JSON.stringify(data))
        } catch {
          // ignore quota errors
        }
      } catch (e) {
        if (cancelled) return
        setWodError('Could not load Word of the Day. Please try again later.')
      } finally {
        if (!cancelled) setWodLoading(false)
      }
    }

    fetchWod()
    return () => {
      cancelled = true
    }
  }, [])

  const doLookup = useCallback(
    async (rawWord: string) => {
      const word = rawWord.trim().toLowerCase()
      if (!word) {
        toast({
          title: 'Empty search',
          description: 'Type a word to look up.',
          variant: 'destructive',
        })
        return
      }
      if (word.length > 80) {
        toast({
          title: 'Too long',
          description: 'Please enter a single word.',
          variant: 'destructive',
        })
        return
      }

      setSubmittedQuery(word)
      setLoading(true)
      setError(null)
      setEntry(null)
      setSuggestions(null)

      try {
        const res = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}`)
        if (res.status === 429) {
          throw new Error('Too many requests. Please slow down a bit.')
        }
        if (res.status === 404) {
          const data = (await res.json().catch(() => ({})) as LookupError)
          setError(data.error || 'Word not found on Wiktionary.')
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : null)
          throw new Error(data.error || 'Word not found on Wiktionary.')
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Could not look up the word.')
        }
        const data = (await res.json()) as DictionaryEntry
        setEntry(data)

        // Update recent searches
        const next = [word, ...recent.filter((w) => w !== word)].slice(0, RECENT_LIMIT)
        setRecent(next)
        saveRecent(next)

        // Smooth scroll to result on mobile / small screens
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 50)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not look up the word.')
      } finally {
        setLoading(false)
      }
    },
    [recent, toast]
  )

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    doLookup(query)
  }

  const clearRecent = () => {
    setRecent([])
    saveRecent([])
    toast({ title: 'Recent searches cleared' })
  }

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast({
        title: 'Audio unavailable',
        description: 'Your browser does not support speech synthesis.',
        variant: 'destructive',
      })
      return
    }
    try {
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'en-US'
      utter.rate = 0.9
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    } catch {
      toast({
        title: 'Audio failed',
        description: 'Could not play pronunciation.',
        variant: 'destructive',
      })
    }
  }

  const isWod = useMemo(
    () => !!entry && !!wod && entry.word.toLowerCase() === wod.word.toLowerCase(),
    [entry, wod]
  )

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfaf7] text-stone-800">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#fbfaf7]/85 border-b border-stone-200/70">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <a
              href="/"
              className="flex items-center gap-2 group"
              onClick={(e) => {
                e.preventDefault()
                setQuery('')
                setSubmittedQuery('')
                setEntry(null)
                setError(null)
                setSuggestions(null)
                searchInputRef.current?.focus()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              <span className="grid place-items-center h-9 w-9 rounded-md bg-[#b32500] text-white shadow-sm">
                <BookOpen className="h-5 w-5" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="font-serif text-xl tracking-tight text-[#1a1a1a]">
                  Webster Free
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500">
                  Ad-Free Dictionary
                </span>
              </span>
            </a>

            <div className="hidden sm:flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-stone-500">
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                No Ads
              </Badge>
              <Badge variant="outline" className="border-stone-300 text-stone-600">
                No Tracking
              </Badge>
              <Badge variant="outline" className="border-stone-300 text-stone-600">
                Free Forever
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ===== Hero / Search ===== */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-8">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-[#1a1a1a]">
              The dictionary,
              <br />
              <span className="text-[#b32500]">without the noise.</span>
            </h1>
            <p className="mt-4 text-stone-600 text-base sm:text-lg leading-relaxed">
              Look up any English word. Real definitions, IPA pronunciations,
              etymology, synonyms, and antonyms from Merriam-Webster (with
              Wiktionary fallback) — plus a daily featured word. No ads, no
              banners, no interruptions.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 max-w-2xl mx-auto">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a word — e.g. serendipity, ephemeral, gregarious…"
                className="h-14 pl-12 pr-28 text-base sm:text-lg rounded-full border-stone-300 bg-white shadow-sm focus-visible:ring-[#b32500] focus-visible:border-[#b32500]"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <Button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-5 rounded-full bg-[#b32500] hover:bg-[#9a1f00] text-white"
              >
                Look Up
              </Button>
            </div>
            <p className="mt-3 text-center text-xs text-stone-500">
              Press <kbd className="px-1.5 py-0.5 rounded border border-stone-300 bg-white">Enter</kbd> to search.
            </p>
          </form>
        </section>

        {/* ===== Word of the Day ===== */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-10">
          <Card className="overflow-hidden border-stone-200 bg-gradient-to-br from-[#fff8f1] to-[#fbfaf7]">
            <CardHeader className="flex flex-row items-start gap-4 space-y-0 border-b border-stone-200/70 bg-white/60">
              <span className="grid place-items-center h-10 w-10 rounded-md bg-[#b32500] text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <CardTitle className="text-base font-semibold text-stone-700 flex items-center gap-2">
                  Word of the Day
                  {wodDateKey && (
                    <span className="text-xs text-stone-500 font-normal flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {wodDateKey}
                    </span>
                  )}
                </CardTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  A new word, every day, picked by the editor.
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {wodLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : wodError ? (
                <p className="text-sm text-stone-500">{wodError}</p>
              ) : wod ? (
                <WodCard entry={wod} onSpeak={speak} onPick={doLookup} />
              ) : null}
            </CardContent>
          </Card>
        </section>

        {/* ===== Recent Searches ===== */}
        {recent.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <History className="h-4 w-4 text-stone-500" />
                Recent searches
              </h2>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearRecent}
                      className="h-8 text-xs text-stone-500 hover:text-stone-700"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Clear
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove all recent searches</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((w) => (
                <Button
                  key={w}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery(w)
                    doLookup(w)
                  }}
                  className="rounded-full border-stone-300 bg-white text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                >
                  {w}
                </Button>
              ))}
            </div>
          </section>
        )}

        {/* ===== Lookup Result ===== */}
        <section
          ref={resultRef}
          className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-16"
        >
          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <EntrySkeleton query={submittedQuery} />
              </motion.div>
            )}

            {!loading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <Card className="border-amber-300 bg-amber-50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <X className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-900">
                          Could not look up &ldquo;{submittedQuery}&rdquo;
                        </p>
                        <p className="text-sm text-amber-800 mt-1">{error}</p>
                        {suggestions && suggestions.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs uppercase tracking-wider text-amber-700 font-medium mb-2">
                              Did you mean one of these?
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {suggestions.map((s) => (
                                <Button
                                  key={s}
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setQuery(s)
                                    doLookup(s)
                                  }}
                                  className="rounded-full border-amber-400 bg-white text-amber-800 hover:bg-amber-100"
                                >
                                  {s}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4 border-amber-400 text-amber-800 hover:bg-amber-100"
                          onClick={() => doLookup(submittedQuery)}
                        >
                          Try again
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {!loading && !error && entry && (
              <motion.div
                key="entry"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <EntryView
                  entry={entry}
                  isWordOfTheDay={isWod}
                  onSpeak={speak}
                  onPick={doLookup}
                />
              </motion.div>
            )}

            {!loading && !error && !entry && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmptyState onPick={doLookup} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer className="border-t border-stone-200 bg-white/70 mt-auto">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-stone-500">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-7 w-7 rounded-md bg-[#b32500] text-white">
              <BookOpen className="h-3.5 w-3.5" />
            </span>
            <span>
              <span className="font-serif text-stone-700">Webster Free</span> — an ad-free
              reader for the Merriam-Webster Collegiate Dictionary and the
              English Wiktionary.
            </span>
          </div>
          <span className="text-xs">
            No ads. No tracking. No popups. MW data © Merriam-Webster Inc.; Wiktionary data © Wiktionary contributors (CC BY-SA).
          </span>
        </div>
      </footer>
    </div>
  )
}

/* -------------------------------------------------------------- */
/* Sub-components                                                  */
/* -------------------------------------------------------------- */

function WodCard({
  entry,
  onSpeak,
  onPick,
}: {
  entry: DictionaryEntry
  onSpeak: (text: string) => void
  onPick: (word: string) => void
}) {
  const playAudio = () => {
    if (entry.audioUrl) {
      try {
        const audio = new Audio(entry.audioUrl)
        audio.play().catch(() => onSpeak(entry.word))
        return
      } catch {
        onSpeak(entry.word)
        return
      }
    }
    onSpeak(entry.word)
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h3 className="font-serif text-3xl sm:text-4xl text-[#1a1a1a]">{entry.word}</h3>
        {entry.phonetic && (
          <span className="text-stone-500 text-sm">{entry.phonetic}</span>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={playAudio}
                className="h-8 px-2 text-stone-500 hover:text-[#b32500]"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {entry.audioUrl
                ? entry.source === 'merriam-webster'
                  ? 'Hear Merriam-Webster pronunciation'
                  : 'Hear Wiktionary pronunciation'
                : 'Hear pronunciation'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Badge variant="secondary" className="bg-stone-100 text-stone-700">
          {entry.partOfSpeech}
        </Badge>
        {(entry.source === 'wiktionary' || entry.source === 'merriam-webster') && (
          <Badge
            variant="outline"
            className="border-emerald-300 text-emerald-700 bg-emerald-50"
          >
            Source: {entry.source === 'merriam-webster' ? 'Merriam-Webster' : 'Wiktionary'}
          </Badge>
        )}
      </div>
      {entry.definitions[0] && (
        <p className="text-stone-700 leading-relaxed">
          {entry.definitions[0].definition}
        </p>
      )}
      {entry.didYouKnow && (
        <div className="rounded-lg bg-[#fff4e6] border border-amber-200 p-4">
          <p className="text-xs uppercase tracking-wider text-amber-700 font-medium mb-1">
            Did You Know?
          </p>
          <p className="text-sm text-stone-700 leading-relaxed">{entry.didYouKnow}</p>
        </div>
      )}
      <Button
        variant="link"
        className="h-auto p-0 text-[#b32500] hover:text-[#9a1f00] font-medium"
        onClick={() => onPick(entry.word)}
      >
        View full entry
        <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  )
}

function EntryView({
  entry,
  isWordOfTheDay,
  onSpeak,
  onPick,
}: {
  entry: DictionaryEntry
  isWordOfTheDay: boolean
  onSpeak: (text: string) => void
  onPick: (word: string) => void
}) {
  const displayWord = titleCase(entry.word)
  // Prefer real MW audio when available; fall back to TTS.
  const playAudio = () => {
    if (entry.audioUrl) {
      try {
        const audio = new Audio(entry.audioUrl)
        audio.play().catch(() => onSpeak(entry.word))
        return
      } catch {
        onSpeak(entry.word)
        return
      }
    }
    onSpeak(entry.word)
  }
  return (
    <article className="space-y-8">
      {/* Word header */}
      <header className="border-b border-stone-200 pb-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h2 className="font-serif text-4xl sm:text-5xl text-[#1a1a1a]">{displayWord}</h2>
          {entry.phonetic && (
            <span className="text-stone-500 text-lg">{entry.phonetic}</span>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={playAudio}
                  className="h-9 px-2 text-stone-500 hover:text-[#b32500]"
                >
                  <Volume2 className="h-5 w-5" />
                  <span className="sr-only">Pronounce {entry.word}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {entry.audioUrl
                  ? entry.source === 'merriam-webster'
                    ? 'Hear Merriam-Webster pronunciation'
                    : 'Hear Wiktionary pronunciation'
                  : 'Hear pronunciation'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className="bg-stone-100 text-stone-700 hover:bg-stone-100">
            {entry.partOfSpeech}
          </Badge>
          {entry.origin && (
            <Badge variant="outline" className="border-stone-300 text-stone-600">
              <Languages className="h-3 w-3 mr-1" />
              {entry.origin}
            </Badge>
          )}
          {entry.firstKnownUse && (
            <Badge variant="outline" className="border-stone-300 text-stone-600">
              First known use: {entry.firstKnownUse}
            </Badge>
          )}
          {isWordOfTheDay && (
            <Badge className="bg-[#b32500] text-white hover:bg-[#b32500]">
              <Sparkles className="h-3 w-3 mr-1" />
              Word of the Day
            </Badge>
          )}
          <Badge
            variant="outline"
            className={
              entry.source === 'wiktionary' || entry.source === 'merriam-webster'
                ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                : 'border-stone-300 text-stone-500'
            }
            title={
              entry.source === 'merriam-webster'
                ? 'Real dictionary data from the Merriam-Webster Collegiate Dictionary.'
                : entry.source === 'wiktionary'
                  ? 'Real dictionary data from the English Wiktionary.'
                  : 'All upstream sources failed — entry generated by AI as a fallback.'
            }
          >
            {entry.source === 'merriam-webster'
              ? 'Source: Merriam-Webster'
              : entry.source === 'wiktionary'
                ? 'Source: Wiktionary'
                : 'Source: AI fallback'}
          </Badge>
        </div>
      </header>

      {/* Definitions */}
      <section>
        <SectionTitle icon={<Layers className="h-4 w-4" />} title="Definitions" />
        <ol className="mt-4 space-y-5">
          {entry.definitions.map((d, i) => (
            <li key={i} className="flex gap-4">
              <span className="grid place-items-center h-7 min-w-7 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 space-y-2">
                <p className="text-stone-800 leading-relaxed">{d.definition}</p>
                {d.example && (
                  <p className="text-stone-600 italic border-l-2 border-stone-200 pl-3 text-sm leading-relaxed">
                    &ldquo;{d.example}&rdquo;
                  </p>
                )}
                {(d.synonyms?.length || d.antonyms?.length) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm pt-1">
                    {d.synonyms && d.synonyms.length > 0 && (
                      <div>
                        <span className="text-stone-500">Synonyms: </span>
                        <span className="text-[#b32500]">{d.synonyms.join(', ')}</span>
                      </div>
                    )}
                    {d.antonyms && d.antonyms.length > 0 && (
                      <div>
                        <span className="text-stone-500">Antonyms: </span>
                        <span className="text-stone-700">{d.antonyms.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* In context */}
      {entry.inContext && (
        <section>
          <SectionTitle icon={<Quote className="h-4 w-4" />} title="In context" />
          <blockquote className="mt-4 border-l-4 border-[#b32500] pl-4 py-1 text-stone-700 leading-relaxed italic">
            {entry.inContext}
          </blockquote>
        </section>
      )}

      {/* Etymology */}
      {entry.etymology && (
        <section>
          <SectionTitle icon={<Network className="h-4 w-4" />} title="Word origin & etymology" />
          <p className="mt-3 text-stone-700 leading-relaxed">{entry.etymology}</p>
        </section>
      )}

      {/* Did you know */}
      {entry.didYouKnow && (
        <section>
          <div className="rounded-xl bg-[#fff4e6] border border-amber-200 p-5">
            <SectionTitle
              icon={<Lightbulb className="h-4 w-4 text-amber-700" />}
              title="Did You Know?"
              className="text-amber-800"
            />
            <p className="mt-3 text-stone-700 leading-relaxed">{entry.didYouKnow}</p>
          </div>
        </section>
      )}

      {/* Synonyms / Antonyms / Rhymes */}
      <section className="grid gap-6 sm:grid-cols-2">
        {entry.synonyms && entry.synonyms.length > 0 && (
          <WordGroup
            title="Synonyms"
            words={entry.synonyms}
            onPick={onPick}
            colorClass="text-[#b32500] hover:bg-[#fff4e6] border-[#b32500]/30"
          />
        )}
        {entry.antonyms && entry.antonyms.length > 0 && (
          <WordGroup
            title="Antonyms"
            words={entry.antonyms}
            onPick={onPick}
            colorClass="text-stone-700 hover:bg-stone-100 border-stone-300"
          />
        )}
        {entry.rhymes && entry.rhymes.length > 0 && (
          <WordGroup
            title="Rhymes with"
            words={entry.rhymes}
            onPick={onPick}
            colorClass="text-stone-700 hover:bg-stone-100 border-stone-300"
          />
        )}
      </section>
    </article>
  )
}

function SectionTitle({
  icon,
  title,
  className,
}: {
  icon: React.ReactNode
  title: string
  className?: string
}) {
  return (
    <h3
      className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-stone-500 ${className ?? ''}`}
    >
      {icon}
      {title}
    </h3>
  )
}

function WordGroup({
  title,
  words,
  onPick,
  colorClass,
}: {
  title: string
  words: string[]
  onPick: (w: string) => void
  colorClass: string
}) {
  return (
    <div>
      <SectionTitle icon={<AudioLines className="h-4 w-4" />} title={title} />
      <div className="mt-3 flex flex-wrap gap-2">
        {words.map((w) => (
          <Button
            key={w}
            variant="outline"
            size="sm"
            onClick={() => onPick(w)}
            className={`rounded-full bg-white ${colorClass}`}
          >
            {w}
          </Button>
        ))}
      </div>
    </div>
  )
}

function EntrySkeleton({ query }: { query: string }) {
  return (
    <article className="space-y-8">
      <header className="border-b border-stone-200 pb-6">
        <Skeleton className="h-12 w-64" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-32" />
        </div>
      </header>
      <div className="space-y-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <p className="text-center text-sm text-stone-500">Looking up &ldquo;{query}&rdquo;…</p>
    </article>
  )
}

function EmptyState({ onPick }: { onPick: (word: string) => void }) {
  const suggestions = [
    'serendipity',
    'ephemeral',
    'ubiquitous',
    'candid',
    'mellifluous',
    'petrichor',
    'limerence',
    'defenestrate',
  ]
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-stone-100 text-stone-500 mb-4">
        <BookOpen className="h-6 w-6" />
      </div>
      <h2 className="font-serif text-2xl text-stone-800">Try a word to begin</h2>
      <p className="mt-2 text-stone-600 max-w-md mx-auto">
        Every lookup pulls real entries from the Merriam-Webster Collegiate
        Dictionary (with Wiktionary as a fallback for words MW doesn't cover).
        Pick one of these to start:
      </p>
      <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-xl mx-auto">
        {suggestions.map((w) => (
          <Button
            key={w}
            variant="outline"
            size="sm"
            onClick={() => onPick(w)}
            className="rounded-full border-stone-300 bg-white text-stone-700 hover:bg-stone-100 hover:text-stone-900"
          >
            {w}
          </Button>
        ))}
      </div>
    </div>
  )
}
