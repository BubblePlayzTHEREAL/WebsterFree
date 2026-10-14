import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import {
  buildEntryFromWiktionary,
  fetchMwDictionary,
  fetchMwThesaurus,
  fetchWiktionarySuggestions,
  fetchWiktionaryWikitext,
  normalize,
  parseMwEntry,
  parseWikitextEntry,
  stripMarkdownFences,
  type DictionaryEntry,
} from "@/lib/dictionary";

export type { DictionaryEntry } from "@/lib/dictionary";

const SYSTEM_PROMPT = `You are a meticulous lexicographer in the style of Merriam-Webster. You return ONLY valid JSON (no markdown, no commentary) that fully describes a dictionary entry for the user's word. If the word is misspelled or not a real word, still return your best-effort entry but set "word" to the closest correct spelling and "partOfSpeech" to "unknown".`;

function userPromptFor(word: string) {
  return `Build a comprehensive, family-friendly dictionary entry for the word: "${word}".

Return STRICT JSON in EXACTLY this shape (no extra keys, no trailing commas, no markdown fences):

{
  "word": "the canonical form of the word, lowercase",
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
- Definitions must be in your own dictionary voice, NOT copied from Merriam-Webster or any other publisher.
- 2-5 senses in "definitions", ordered from most common to least common.
- Keep examples short and human.
- Output ONLY the JSON object. No prose, no fences.`;
}

async function lookupFromMw(
  word: string,
  dictKey: string | undefined,
  thesKey: string | undefined
): Promise<{ entry: DictionaryEntry | null; suggestions?: string[] } | null> {
  if (!dictKey) return null;
  const dictJson = await fetchMwDictionary(word, dictKey);
  const thesJson = thesKey ? await fetchMwThesaurus(word, thesKey) : null;
  return parseMwEntry(dictJson, thesJson, word);
}

async function lookupFromWiktionary(
  word: string
): Promise<{ entry: DictionaryEntry | null; suggestions?: string[] }> {
  const wikitext = await fetchWiktionaryWikitext(word);
  if (!wikitext) {
    const suggestions = await fetchWiktionarySuggestions(word);
    return { entry: null, suggestions };
  }
  const parsed = parseWikitextEntry(wikitext, word);
  if (!parsed) {
    const suggestions = await fetchWiktionarySuggestions(word);
    return { entry: null, suggestions };
  }
  const entry = await buildEntryFromWiktionary(parsed, word);
  return { entry };
}

async function lookupFromAi(word: string): Promise<DictionaryEntry | null> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      { role: "user", content: userPromptFor(word) },
    ],
    thinking: { type: "disabled" },
  });
  let raw = completion.choices[0]?.message?.content ?? "";
  raw = stripMarkdownFences(raw);
  let parsedAny: unknown;
  try {
    parsedAny = JSON.parse(raw);
  } catch {
    return null;
  }
  const normalized = normalize(parsedAny);
  if (!normalized) return null;
  normalized.source = "ai-fallback";
  return normalized;
}

export async function GET(req: NextRequest) {
  const word = req.nextUrl.searchParams.get("word")?.trim();

  if (!word) {
    return NextResponse.json(
      { error: "Missing 'word' query parameter." },
      { status: 400 }
    );
  }

  if (word.length > 80) {
    return NextResponse.json(
      { error: "Word too long. Please provide a single word." },
      { status: 400 }
    );
  }

  const dictKey = process.env.MERRIAM_WEBSTER_DICTIONARY_API_KEY;
  const thesKey = process.env.MERRIAM_WEBSTER_THESAURUS_API_KEY;

  try {
    // 1. Try Merriam-Webster Collegiate Dictionary + Thesaurus first (most
    //    authoritative source, has real audio + per-sense synonyms/antonyms).
    if (dictKey) {
      try {
        const mw = await lookupFromMw(word, dictKey, thesKey);
        if (mw?.entry) {
          return NextResponse.json(mw.entry as DictionaryEntry, {
            headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
          });
        }
        // If MW has suggestions, fall through to Wiktionary first (MW might
        // not have the word, but Wiktionary probably does — and we'd rather
        // give the user real Wiktionary data than hallucinated AI data).
        // But if Wiktionary also doesn't have it, return MW's suggestions.
        const wt = await lookupFromWiktionary(word);
        if (wt.entry) {
          return NextResponse.json(wt.entry as DictionaryEntry, {
            headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
          });
        }
        if (mw?.suggestions && mw.suggestions.length > 0) {
          return NextResponse.json(
            {
              error: "Word not found in Merriam-Webster or Wiktionary.",
              suggestions: mw.suggestions,
            },
            { status: 404 }
          );
        }
        if (wt.suggestions && wt.suggestions.length > 0) {
          return NextResponse.json(
            {
              error: "Word not found in Merriam-Webster or Wiktionary.",
              suggestions: wt.suggestions,
            },
            { status: 404 }
          );
        }
        return NextResponse.json(
          { error: "Word not found in Merriam-Webster or Wiktionary." },
          { status: 404 }
        );
      } catch (err) {
        // MW unreachable → fall back to Wiktionary, then AI.
        console.warn("MW lookup failed, trying Wiktionary:", err);
        const wt = await lookupFromWiktionary(word);
        if (wt.entry) {
          return NextResponse.json(wt.entry as DictionaryEntry, {
            headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
          });
        }
        if (wt.suggestions && wt.suggestions.length > 0) {
          return NextResponse.json(
            {
              error: "Word not found on Wiktionary.",
              suggestions: wt.suggestions,
            },
            { status: 404 }
          );
        }
      }
    }

    // 2. No MW key configured → try Wiktionary first.
    if (!dictKey) {
      try {
        const wt = await lookupFromWiktionary(word);
        if (wt.entry) {
          return NextResponse.json(wt.entry as DictionaryEntry, {
            headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
          });
        }
        if (wt.suggestions && wt.suggestions.length > 0) {
          return NextResponse.json(
            {
              error: "Word not found on Wiktionary.",
              suggestions: wt.suggestions,
            },
            { status: 404 }
          );
        }
        return NextResponse.json(
          { error: "Word not found on Wiktionary." },
          { status: 404 }
        );
      } catch (err) {
        console.warn("Wiktionary lookup failed, falling back to AI:", err);
      }
    }

    // 3. Last resort: AI fallback (only when MW and Wiktionary both failed
    //    due to network errors — NOT for genuinely missing words).
    const entry = await lookupFromAi(word);
    if (!entry) {
      return NextResponse.json(
        { error: "Failed to generate a dictionary entry." },
        { status: 502 }
      );
    }
    return NextResponse.json(entry, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch (err) {
    console.error("Dictionary lookup error:", err);
    return NextResponse.json(
      { error: "Lexicographer service is unavailable." },
      { status: 500 }
    );
  }
}
