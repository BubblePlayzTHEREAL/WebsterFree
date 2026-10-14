import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import {
  buildEntryFromWiktionary,
  fetchMwDictionary,
  fetchMwThesaurus,
  fetchWiktionaryWikitext,
  normalize,
  parseMwEntry,
  parseWikitextEntry,
  stripMarkdownFences,
  todaysWodCandidate,
  WOD_CANDIDATES,
  type DictionaryEntry,
} from "@/lib/dictionary";

const SYSTEM_PROMPT = `You are a meticulous lexicographer in the style of Merriam-Webster. You return ONLY valid JSON (no markdown, no commentary) that fully describes a dictionary entry for the user's word.`;

function aiUserPromptFor(word: string) {
  return `Build a comprehensive, family-friendly dictionary entry for the word: "${word}".

Return STRICT JSON in EXACTLY this shape (no extra keys, no trailing commas, no markdown fences):

{
  "word": "the lowercase word",
  "phonetic": "/IPA phonetic spelling/",
  "phonetics": [{"text": "/IPA/", "audio": ""}],
  "partOfSpeech": "noun | verb | adjective | adverb | etc.",
  "definitions": [
    {
      "definition": "A clear, numbered sense of the word, written in your own dictionary voice.",
      "example": "A short example sentence using this sense.",
      "synonyms": ["synonym1", "synonym2"],
      "antonyms": ["antonym1"]
    }
  ],
  "synonyms": ["flat list of 4-8 synonyms"],
  "antonyms": ["flat list of 0-4 antonyms"],
  "etymology": "1-3 sentences on the origin of the word, including source languages and meaning of the root.",
  "origin": "short phrase naming the source language, e.g. 'Latin' or 'Old French'",
  "firstKnownUse": "a year or century, e.g. 'circa 1530' or '14th century'",
  "rhymes": ["3-5 rhyming words"],
  "inContext": "A single longer example sentence or short paragraph showing the word used in context. MUST be a single string, not an array.",
  "didYouKnow": "A short, engaging 'Did You Know?' style fact about the word's history, usage, or quirks."
}

Critical rules:
- "definitions" MUST be an array of OBJECTS each containing a "definition" string key. NOT an array of strings.
- "inContext" MUST be a single string. NOT an array.
- "synonyms", "antonyms", "rhymes" MUST be arrays of strings.
- "partOfSpeech" MUST be present as a string.
- "phonetic" MUST be present as a string with IPA.
- Output ONLY the JSON object. No prose, no fences.`;
}

async function lookupMwWord(
  word: string,
  dictKey: string,
  thesKey?: string
): Promise<DictionaryEntry | null> {
  const dictJson = await fetchMwDictionary(word, dictKey);
  const thesJson = thesKey ? await fetchMwThesaurus(word, thesKey) : null;
  const parsed = parseMwEntry(dictJson, thesJson, word);
  return parsed.entry;
}

async function lookupWiktionaryWord(
  word: string
): Promise<DictionaryEntry | null> {
  const wikitext = await fetchWiktionaryWikitext(word);
  if (!wikitext) return null;
  const parsed = parseWikitextEntry(wikitext, word);
  if (!parsed) return null;
  return await buildEntryFromWiktionary(parsed, word);
}

export async function GET() {
  try {
    const dictKey = process.env.MERRIAM_WEBSTER_DICTIONARY_API_KEY;
    const thesKey = process.env.MERRIAM_WEBSTER_THESAURUS_API_KEY;

    const candidate = todaysWodCandidate();

    // Try MW first for the candidate; if MW doesn't have it (rare), walk
    // forward through the list. Cap at 3 MW tries to save rate-limit budget.
    if (dictKey) {
      for (let i = 0; i < 3; i++) {
        const word = i === 0 ? candidate : rotateWord(candidate, i);
        try {
          const entry = await lookupMwWord(word, dictKey, thesKey);
          if (entry) {
            return NextResponse.json(entry as DictionaryEntry, {
              headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
            });
          }
        } catch (err) {
          console.warn(`MW WOD lookup failed for "${word}":`, err);
          break; // Network error → fall back to Wiktionary path
        }
      }
    }

    // Wiktionary fallback — walk forward through the list.
    for (let i = 0; i < 10; i++) {
      const word = i === 0 ? candidate : rotateWord(candidate, i);
      try {
        const entry = await lookupWiktionaryWord(word);
        if (entry) {
          return NextResponse.json(entry as DictionaryEntry, {
            headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
          });
        }
      } catch {
        continue;
      }
    }

    // Final fallback: AI for the original candidate so WOD still shows.
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: aiUserPromptFor(candidate) },
      ],
      thinking: { type: "disabled" },
    });
    let raw = completion.choices[0]?.message?.content ?? "";
    raw = stripMarkdownFences(raw);
    let parsedAny: unknown;
    try {
      parsedAny = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Word of the Day." },
        { status: 502 }
      );
    }
    const normalized = normalize(parsedAny);
    if (!normalized) {
      return NextResponse.json(
        { error: "Malformed Word of the Day." },
        { status: 502 }
      );
    }
    normalized.source = "ai-fallback";
    return NextResponse.json(normalized as DictionaryEntry, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch (err) {
    console.error("Word of the Day error:", err);
    return NextResponse.json(
      { error: "Could not fetch Word of the Day." },
      { status: 500 }
    );
  }
}

function rotateWord(base: string, offset: number): string {
  const idx = WOD_CANDIDATES.indexOf(base);
  if (idx === -1) return base;
  const next = (idx + offset) % WOD_CANDIDATES.length;
  return WOD_CANDIDATES[next];
}
