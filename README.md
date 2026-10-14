# Webster Free

A clean, ad-free, Merriam-Webster-style dictionary web app. No ads, no banners, no popups, no tracking.

Look up any English word and get real dictionary data — definitions, IPA pronunciations (with real audio), etymology, synonyms, antonyms, and a daily featured word — all in a clean, distraction-free UI.

## Source priority chain

Every lookup tries three sources in order, with full transparency about which one supplied the data:

1. **Merriam-Webster Collegiate Dictionary + Thesaurus API** (primary) — real definitions, real audio pronunciations, real per-sense synonyms/antonyms. Marked in the UI with a green *"Source: Merriam-Webster"* badge.
2. **English Wiktionary** (fallback) — for words MW doesn't cover. Uses the official Wikimedia Action API (no auth, no rate limit, freely licensed CC BY-SA). Marked with a green *"Source: Wiktionary"* badge.
3. **AI fallback** (last resort) — only when both upstream APIs are unreachable due to network errors. Never used for genuinely missing words, so the app never silently hallucinates a definition for a misspelled word. Marked with a neutral *"Source: AI fallback"* badge.

## Features

- **Hero search bar** with Enter-to-search and a pill "Look Up" button
- **Word of the Day** card — deterministically rotated by day-of-year, cached 24h in localStorage
- **Full dictionary entry view** with:
  - Title-case word + IPA phonetic + clickable speaker button (real MW or Wikimedia Commons audio)
  - Part-of-speech badge, origin badge, "First known use" badge
  - Numbered definitions, each with an example sentence
  - Etymology section
  - Synonyms and antonyms chips — click to jump to that word
- **Recent searches** strip persisted in localStorage (last 8, with clear button)
- **Empty state** with 8 curated interesting starter words
- **Loading skeletons** and **error states** with "Did you mean…?" suggestions for misspellings
- **Sticky backdrop-blur header** with red Merriam-Webster-style brand mark
- **Sticky footer** with proper licensing attribution
- **Framer Motion** page transitions
- **Playfair Display** serif for headlines, Geist Sans for body
- **Fully responsive** — mobile-first design

## Tech stack

- [Next.js 16](https://nextjs.org/) with App Router
- [TypeScript 5](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/)
- [Prisma ORM](https://www.prisma.io/) (SQLite client, for optional server-side caching)
- [Framer Motion](https://www.framer.com/motion/) for transitions
- [Lucide](https://lucide.dev/) for icons
- [z-ai-web-dev-sdk](https://www.npmjs.com/package/z-ai-web-dev-sdk) for the AI fallback path

## Setup

### 1. Install dependencies

```bash
bun install
# or
npm install
```

### 2. Add Merriam-Webster API keys (optional but recommended)

1. Register for a free key at <https://www.dictionaryapi.com/register.htm>
2. Request **both** a Collegiate Dictionary key AND a Collegiate Thesaurus key (1,000 refs/day each, free tier)
3. Copy `.env.example` to `.env` and fill in your keys:

   ```bash
   cp .env.example .env
   ```

   ```
   MERRIAM_WEBSTER_DICTIONARY_API_KEY=your-dictionary-key-here
   MERRIAM_WEBSTER_THESAURUS_API_KEY=your-thesaurus-key-here
   ```

Without these keys, the app uses Wiktionary as the primary source — still real dictionary data, just slightly less authoritative for some words.

### 3. Run the dev server

```bash
bun run dev
# or
npm run dev
```

Open <http://localhost:3000> in your browser.

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── dictionary/route.ts       # GET /api/dictionary?word=...
│   │   └── word-of-the-day/route.ts  # GET /api/word-of-the-day
│   ├── globals.css
│   ├── layout.tsx                    # Root layout, fonts
│   └── page.tsx                      # The whole dictionary UI
├── components/ui/                    # shadcn/ui component library
├── lib/
│   ├── dictionary.ts                 # MW + Wiktionary adapters + parser
│   └── utils.ts
└── hooks/                            # use-toast, use-mobile
```

## License

- **Source code**: MIT
- **Dictionary data**: © Merriam-Webster Inc. (Collegiate Dictionary data, fetched via their API under their terms of service) and © Wiktionary contributors, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## Acknowledgments

- [Merriam-Webster](https://www.merriam-webster.com/) for their Collegiate Dictionary API
- [Wiktionary](https://en.wiktionary.org/) and the Wikimedia community for the freely-licensed dictionary
- [shadcn/ui](https://ui.shadcn.com/) for the component library
- [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) by Claus Eggers Sørensen
