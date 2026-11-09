export interface Definition {
  definition: string;
  /**
   * Styled rendering of the definition (Merriam-Webster source only).
   * Cross-reference words carry `href` and render as blue italic links,
   * matching merriam-webster.com. Falls back to `definition` when absent.
   */
  segments?: DefSegment[];
  example?: string;
  exampleSegments?: DefSegment[];
  synonyms?: string[];
  antonyms?: string[];
}

export interface DefSegment {
  text: string;
  /** Cross-reference target word — rendered as a blue Merriam-Webster-style link. */
  href?: string;
  italic?: boolean;
  bold?: boolean;
  smallCaps?: boolean;
  sup?: boolean;
  sub?: boolean;
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  partOfSpeech: string;
  definitions: Definition[];
  synonyms?: string[];
  antonyms?: string[];
  etymology?: string;
  /** Styled etymology segments (Merriam-Webster source only). */
  etymologySegments?: DefSegment[];
  origin?: string;
  firstKnownUse?: string;
  rhymes?: string[];
  inContext?: string;
  didYouKnow?: string;
  /** Real audio URL from Wikimedia Commons. */
  audioUrl?: string;
  /** Where this entry came from, surfaced in the UI for transparency. */
  source?: "merriam-webster" | "wiktionary" | "ai-fallback";
}

const asStrArr = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const filtered = v
    .filter((s: any): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
  return filtered.length > 0 ? filtered : undefined;
};

/**
 * Coerce AI-returned JSON shapes into our strict DictionaryEntry. Kept so the
 * AI-fallback path keeps working when Wiktionary is unreachable.
 */
export function normalize(raw: unknown): DictionaryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const word =
    typeof r.word === "string" ? r.word.trim().toLowerCase() : "";
  if (!word) return null;

  let definitions: Definition[] = [];
  if (Array.isArray(r.definitions)) {
    definitions = (r.definitions as unknown[])
      .map((d: unknown): Definition | null => {
        if (typeof d === "string") {
          const trimmed = d.trim();
          return trimmed ? { definition: trimmed } : null;
        }
        if (d && typeof d === "object") {
          const obj = d as Record<string, unknown>;
          if (typeof obj.definition === "string") {
            return {
              definition: (obj.definition as string).trim(),
              example:
                typeof obj.example === "string" && obj.example.trim()
                  ? obj.example.trim()
                  : undefined,
              synonyms: asStrArr(obj.synonyms),
              antonyms: asStrArr(obj.antonyms),
            };
          }
        }
        return null;
      })
      .filter((d: Definition | null): d is Definition => d !== null && !!d.definition);
  } else if (typeof r.definitions === "string" && r.definitions.trim()) {
    definitions = [{ definition: r.definitions.trim() }];
  }

  if (definitions.length === 0) return null;

  let phonetic: string | undefined;
  if (typeof r.phonetic === "string" && r.phonetic.trim()) {
    phonetic = r.phonetic.trim();
  } else if (
    Array.isArray(r.phonetics) &&
    r.phonetics[0] &&
    typeof r.phonetics[0] === "object" &&
    typeof (r.phonetics[0] as Record<string, unknown>).text === "string"
  ) {
    phonetic = (r.phonetics[0] as Record<string, unknown>).text as string;
  }

  let inContext: string | undefined;
  if (typeof r.inContext === "string" && r.inContext.trim()) {
    inContext = r.inContext.trim();
  } else if (Array.isArray(r.inContext) && r.inContext.length > 0) {
    inContext = (r.inContext as unknown[])
      .filter((s: unknown) => typeof s === "string" && (s as string).trim())
      .map((s: unknown) => (s as string).trim())
      .join(" ");
  }

  const partOfSpeech =
    typeof r.partOfSpeech === "string" && r.partOfSpeech.trim()
      ? r.partOfSpeech.trim().toLowerCase()
      : "unknown";

  return {
    word,
    phonetic,
    phonetics: Array.isArray(r.phonetics)
      ? (r.phonetics as { text?: string; audio?: string }[])
      : undefined,
    partOfSpeech,
    definitions,
    synonyms: asStrArr(r.synonyms),
    antonyms: asStrArr(r.antonyms),
    etymology:
      typeof r.etymology === "string" && r.etymology.trim()
        ? r.etymology.trim()
        : undefined,
    origin:
      typeof r.origin === "string" && r.origin.trim()
        ? r.origin.trim()
        : undefined,
    firstKnownUse:
      typeof r.firstKnownUse === "string" && r.firstKnownUse.trim()
        ? r.firstKnownUse.trim()
        : undefined,
    rhymes: asStrArr(r.rhymes),
    inContext,
    didYouKnow:
      typeof r.didYouKnow === "string" && r.didYouKnow.trim()
        ? r.didYouKnow.trim()
        : undefined,
  };
}

export function stripMarkdownFences(raw: string): string {
  let out = raw.trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return out;
}

/* ============================================================================ */
/* Merriam-Webster adapter (Collegiate Dictionary + Thesaurus API)               */
/* ============================================================================ */

// Overridable for local testing against a recorded MW response (see
// scripts/mock_mw_server.py); defaults to the real Collegiate endpoint.
const MW_DICT_BASE =
  process.env.MW_DICT_BASE ||
  "https://dictionaryapi.com/api/v3/references/collegiate/json";
const MW_THES_BASE = "https://dictionaryapi.com/api/v3/references/thesaurus/json";
const MW_AUDIO_BASE = "https://media.merriam-webster.com/audio/prons/en-us/mp3";

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";

/*
 * MW curly-brace markup, parsed into styled segments.
 *
 * Two shapes (per MW's JSON data-model docs, section 2.29):
 *
 *  1. Paired formatting tags — {it}…{/it}, {sc}…{/sc}, {dx}…{/dx}, … The
 *     markers carry no text; we drop them and keep the words they wrap,
 *     remembering the style ({it} italic, {sc} small caps, …).
 *
 *  2. Pipe-form cross-reference tags — {a_link|engine}, {d_link|machinery|x},
 *     {dxt|carrier||}, {sx|automobile||1}, {et_link|French|french}, … Field 2
 *     is the visible link text (what merriam-webster.com paints blue and
 *     italic); field 3, when non-empty, is the link target id; field 4 adds
 *     trailing text like a sense number ("sense 2").
 *
 * The parser is a small recursive tokenizer rather than a chain of replaces,
 * so nothing that wraps or points at real words can be silently dropped.
 */

type SegStyle = Pick<DefSegment, "italic" | "bold" | "smallCaps" | "sup" | "sub">;

const XREF_TAGS = new Set([
  "a_link", "d_link", "i_link", "et_link", "mat", "sx", "dxt", "tagt", "ux", "uxt",
]);

const PAIRED_STYLES: Record<string, SegStyle> = {
  it: { italic: true },
  wi: { italic: true },
  qword: { italic: true },
  b: { bold: true },
  phrase: { bold: true, italic: true },
  bit: { bold: true, italic: true },
  sc: { smallCaps: true },
  itsc: { italic: true, smallCaps: true },
  parahw: { bold: true, smallCaps: true },
  sup: { sup: true },
  inf: { sub: true },
  rom: {},
};

/** Tokenize MW markup into segments (untidied — spacing fixed by tidySegments). */
function mwTokenize(s: string, style: SegStyle, out: DefSegment[]): void {
  let i = 0;
  const n = s.length;
  while (i < n) {
    const brace = s.indexOf("{", i);
    if (brace === -1) {
      out.push({ text: s.slice(i), ...style });
      break;
    }
    if (brace > i) out.push({ text: s.slice(i, brace), ...style });

    // Find the end of this tag, brace-depth aware.
    let j = brace + 1;
    let depth = 1;
    while (j < n && depth > 0) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    if (depth !== 0) {
      // Unterminated tag — emit the rest literally rather than loop.
      out.push({ text: s.slice(brace), ...style });
      break;
    }
    const tagBody = s.slice(brace + 1, j);
    i = j + 1;

    if (tagBody.startsWith("/")) continue; // stray close tag — ignore
    const m = /^([a-zA-Z_]+)([\s\S]*)$/.exec(tagBody);
    if (!m) continue; // "{}" — nothing to do
    const name = m[1].toLowerCase();
    const rest = m[2];

    if (name === "bc") {
      out.push({ text: ": " }); // bold colon — MW's sense separator
      continue;
    }
    if (name === "ldquo") {
      out.push({ text: "\u201C", ...style });
      continue;
    }
    if (name === "rdquo") {
      out.push({ text: "\u201D", ...style });
      continue;
    }
    if (name === "p_br") {
      out.push({ text: "\n" });
      continue;
    }

    if (rest.startsWith("|") && (XREF_TAGS.has(name) || !hasMatchingClose(s, name, i))) {
      // Pipe-form tag: field 2 is the visible link text, field 3 (if any) the
      // link target, field 4 trailing text such as a sense number.
      const args = rest.slice(1).split("|");
      const display = (args[0] ?? "").trim().replace(/^(\S+):\d+$/, "$1");
      if (XREF_TAGS.has(name)) {
        const target = (args[1] ?? "").trim() || (args[0] ?? "").trim();
        const href = target.split(":")[0].trim();
        if (display) out.push({ text: display, href, italic: true });
        // Field 4: sense number / vt-vi info to show after the link text.
        const sense = (args[2] ?? "").trim();
        if (sense === "illustration") out.push({ text: " illustration" });
        else if (sense && sense !== "table")
          out.push({ text: /^\d/.test(sense) ? ` sense ${sense}` : ` ${sense}` });
      } else if (display) {
        // Unknown pipe-form tag — keep the first argument (least lossy).
        out.push({ text: display, ...style });
      }
      continue;
    }

    // Paired tag: find its matching close and recurse over the content.
    const close = `{/${name}}`;
    const closeIdx = s.indexOf(close, i);
    if (closeIdx === -1) continue; // malformed — drop the marker only
    const childRaw = s.slice(i, closeIdx);
    i = closeIdx + close.length;

    if (name === "p_only" || name === "pdxt" || name === "pdx") continue; // print-only
    if (name === "gloss") {
      out.push({ text: "[" });
      mwTokenize(childRaw, {}, out);
      out.push({ text: "]" });
      continue;
    }
    if (name === "dx" || name === "dx_ety") {
      // Em-dash before the group — but only when it has introductory text
      // ("— compare X"; a bare {bc}{dx}{dxt…} renders as ": agent, instrument").
      if (/^[^{]*\S/.test(childRaw)) out.push({ text: " — " });
      mwTokenize(childRaw, style, out);
      continue;
    }
    if (name === "dx_def") {
      out.push({ text: "(" });
      mwTokenize(childRaw, style, out);
      out.push({ text: ")" });
      continue;
    }
    if (name === "ma") {
      out.push({ text: " — more at " });
      mwTokenize(childRaw, style, out);
      continue;
    }
    const childStyle = PAIRED_STYLES[name];
    if (childStyle) {
      mwTokenize(childRaw.trim(), { ...style, ...childStyle }, out);
      continue;
    }
    // Unknown paired tag: drop the markers, keep what they wrapped.
    mwTokenize(childRaw, style, out);
  }
}

function hasMatchingClose(s: string, name: string, from: number): boolean {
  return s.indexOf(`{/${name}}`, from) !== -1;
}

/**
 * Normalize spacing across segment boundaries: no space before ,.;:!?)] ,
 * none after ( [ , no doubled spaces, and no sense-initial bold colon.
 */
function tidySegments(segs: DefSegment[]): DefSegment[] {
  const out: DefSegment[] = [];
  for (const seg of segs) {
    const text = seg.text.replace(/[ \t]{2,}/g, " ");
    if (text === "") continue;
    const prev = out.length ? out[out.length - 1] : null;
    let t = text;
    if (prev) {
      if (/\s$/.test(prev.text) && /^\s/.test(t)) prev.text = prev.text.replace(/[ \t]+$/, "");
      if (/^[,.;:!?)\]]/.test(t)) {
        t = t.replace(/^[ \t]+/, "");
        prev.text = prev.text.replace(/[ \t]+$/, "");
      } else if (/[([]$/.test(prev.text)) {
        t = t.replace(/^[ \t]+/, "");
      }
    } else {
      t = t.replace(/^\s+/, "").replace(/^:\s*/, "");
    }
    if (t === "") continue;
    out.push({ ...seg, text: t });
  }
  while (out.length) {
    const last = out[out.length - 1].text;
    if (last.trim() === "") {
      out.pop();
      continue;
    }
    if (/[ \t]+$/.test(last)) out[out.length - 1].text = last.replace(/[ \t]+$/, "");
    break;
  }
  return out.filter((s) => s.text !== "");
}

function segmentsToPlainText(segs: DefSegment[]): string {
  return segs
    .map((s) => s.text)
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?)\]])/g, "$1")
    .replace(/([(])[ \t]+/g, "$1")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/** Parse MW markup into tidied, styled segments. */
function mwParse(s: string): DefSegment[] {
  const out: DefSegment[] = [];
  mwTokenize(s, {}, out);
  return tidySegments(out);
}

function stripInlineMarkup(s: string): string {
  return segmentsToPlainText(mwParse(s));
}

function mwAudioSubfolder(audioName: string): string {
  if (!audioName) return "a";
  const first = audioName[0].toLowerCase();
  if (/^[2-9]$/.test(first)) return "b1";
  if (first === "0" || first === "1") return "0";
  return first;
}

function parseMwHeadword(entry: any): {
  hw?: string;
  prs: { ipa?: string; audioUrl?: string }[];
} {
  const hwi = entry?.hwi;
  if (!isObj(hwi)) return { prs: [] };

  let hw: string | undefined;
  if (typeof hwi.hw === "string") {
    hw = hwi.hw.replace(/\*/g, "·");
  }

  const prs: { ipa?: string; audioUrl?: string }[] = [];
  const collect = (arr: any) => {
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      if (!isObj(p)) continue;
      const ipa = typeof p.ipa === "string" ? `/${p.ipa}/` : undefined;
      const audio = isObj(p.sound) && typeof p.sound.audio === "string" ? p.sound.audio : undefined;
      prs.push({
        ipa,
        audioUrl: audio ? `${MW_AUDIO_BASE}/${mwAudioSubfolder(audio)}/${audio}.mp3` : undefined,
      });
    }
  };
  collect(hwi.prs);
  if (prs.length === 0 && Array.isArray(entry?.prs)) collect(entry.prs);
  return { hw, prs };
}

interface MwDtParse {
  /** Raw (untidied) segments of all dt "text" items. */
  segments: DefSegment[];
  example?: string;
  exampleSegments?: DefSegment[];
}

function parseMwDt(dt: unknown): MwDtParse {
  const result: MwDtParse = { segments: [] };
  if (!Array.isArray(dt)) return result;
  for (const item of dt) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const [tag, val] = item;
    if (tag === "text" && typeof val === "string") {
      mwTokenize(val, {}, result.segments);
    } else if (tag === "vis" && Array.isArray(val)) {
      // Take only the first example sentence so we don't mash several
      // unrelated citations together.
      if (!result.example) {
        const first = (val as unknown[]).find(
          (v) => isObj(v) && typeof v.t === "string"
        );
        if (first) {
          const exSegs = mwParse((first as { t: string }).t);
          result.exampleSegments = exSegs;
          result.example = segmentsToPlainText(exSegs);
        }
      }
    } else if (tag === "uns" && Array.isArray(val)) {
      // Usage note — inline, preceded by a space and an em-dash.
      for (const note of val) {
        if (Array.isArray(note) && note[0] === "text" && typeof note[1] === "string") {
          result.segments.push({ text: " — " });
          mwTokenize(note[1], {}, result.segments);
        }
      }
    } else if (tag === "snote" && Array.isArray(val)) {
      // Supplemental note — displayed after a newline.
      for (const note of val) {
        if (Array.isArray(note) && note[0] === "t" && typeof note[1] === "string") {
          result.segments.push({ text: "\n" });
          mwTokenize(note[1], {}, result.segments);
        }
      }
    }
  }
  return result;
}

interface MwSenseParse {
  definition?: string;
  segments?: DefSegment[];
  example?: string;
  exampleSegments?: DefSegment[];
}

/**
 * Build one flat definition row from a sense payload: subject/status labels
 * (sls, e.g. "obsolete"), the defining text, and a divided sense (sdsense,
 * e.g. "also : …") inlined after a semicolon — the way MW's own site shows it.
 */
function parseMwSensePayload(payload: Record<string, unknown>): MwSenseParse {
  const dt = parseMwDt(payload.dt);
  const segs: DefSegment[] = [];

  if (Array.isArray(payload.sls)) {
    const labels = (payload.sls as unknown[]).filter(
      (l): l is string => typeof l === "string" && l.trim().length > 0
    );
    labels.forEach((l, idx) => {
      segs.push({ text: l.trim(), italic: true });
      if (idx < labels.length - 1) segs.push({ text: ", " });
    });
    if (labels.length) {
      // The label owns the ": " separator now — strip the dt's own leading
      // whitespace + bold colon so we don't render "obsolete:: ingenuity".
      segs.push({ text: ": " });
      let rest = dt.segments.slice();
      while (rest.length && rest[0].text.trim() === "") rest.shift();
      if (rest.length && /^\s*:/.test(rest[0].text)) {
        const t = rest[0].text.replace(/^\s*:\s*/, "");
        rest = t ? [{ ...rest[0], text: t }, ...rest.slice(1)] : rest.slice(1);
      }
      segs.push(...rest);
    } else {
      segs.push(...dt.segments);
    }
  } else {
    segs.push(...dt.segments);
  }

  if (isObj(payload.sdsense)) {
    const sd = payload.sdsense as Record<string, unknown>;
    const sdText = typeof sd.sd === "string" ? sd.sd.trim() : "";
    const sdDt = parseMwDt(sd.dt);
    if (sdText || sdDt.segments.length) {
      segs.push({ text: "; " });
      if (sdText) segs.push({ text: sdText, italic: true }, { text: " " });
      segs.push(...sdDt.segments);
    }
  }

  const tidied = tidySegments(segs);
  return {
    definition: segmentsToPlainText(tidied) || undefined,
    segments: tidied.length ? tidied : undefined,
    example: dt.example,
    exampleSegments: dt.exampleSegments,
  };
}

function parseMwSenseSequence(sseq: unknown): MwSenseParse[] {
  const senses: MwSenseParse[] = [];
  if (!Array.isArray(sseq)) return senses;
  for (const senseGroup of sseq) {
    if (!Array.isArray(senseGroup)) continue;
    for (const inner of senseGroup) {
      if (!Array.isArray(inner) || inner.length < 2) continue;
      const [type, payload] = inner;
      if (!isObj(payload)) continue;
      if (type === "sense") {
        const parsed = parseMwSensePayload(payload);
        if (parsed.definition || parsed.example) senses.push(parsed);
      } else if (type === "uns") {
        // "uns" (unqualified sense, e.g. in phrasal-verb entries) has the
        // same shape as "sense" — without this branch its text is dropped.
        const parsed = parseMwSensePayload(payload);
        if (parsed.definition || parsed.example) senses.push(parsed);
      } else if (type === "pseq") {
        senses.push(...parseMwSenseSequence(payload.sseq));
      } else if (type === "bs") {
        // "bs" (binding sense) has its own sense text plus a nested sseq.
        if (isObj(payload.sense)) {
          const parsed = parseMwSensePayload(payload.sense as Record<string, unknown>);
          if (parsed.definition || parsed.example) senses.push(parsed);
        }
        senses.push(...parseMwSenseSequence(payload.sseq));
      }
      // "sen" (truncated sense with etymology) carries no dt of its own;
      // its siblings in the same group hold the defining text.
    }
  }
  return senses;
}

function parseMwThesaurusSynonyms(entry: any): {
  synonyms?: string[];
  antonyms?: string[];
} {
  const result: { synonyms?: string[]; antonyms?: string[] } = {};
  const allSyn: string[] = [];
  const allAnt: string[] = [];

  const def = entry?.def;
  if (Array.isArray(def)) {
    for (const d of def) {
      if (!isObj(d)) continue;
      const sseq = d.sseq;
      if (!Array.isArray(sseq)) continue;
      for (const senseGroup of sseq) {
        if (!Array.isArray(senseGroup)) continue;
        for (const inner of senseGroup) {
          if (!Array.isArray(inner) || inner.length < 2) continue;
          const [type, payload] = inner;
          if (type === "sense" && isObj(payload)) {
            const collectFrom = (key: string, target: string[]) => {
              if (!Array.isArray(payload[key])) return;
              for (const group of payload[key]) {
                if (!Array.isArray(group)) continue;
                for (const item of group) {
                  if (isObj(item) && typeof item.wd === "string") {
                    target.push((item as any).wd);
                  }
                }
              }
            };
            collectFrom("syn_list", allSyn);
            collectFrom("ant_list", allAnt);
            collectFrom("rel_list", allSyn);
          }
        }
      }
    }
  }
  // Top-level syn_list/ant_list (older format)
  const collectTop = (key: string, target: string[]) => {
    if (!Array.isArray(entry?.[key])) return;
    for (const group of entry[key]) {
      if (!Array.isArray(group)) continue;
      for (const item of group) {
        if (isObj(item) && typeof item.wd === "string") target.push((item as any).wd);
      }
    }
  };
  collectTop("syn_list", allSyn);
  collectTop("ant_list", allAnt);

  if (allSyn.length) {
    result.synonyms = Array.from(new Set(allSyn.map((w) => w.toLowerCase()))).slice(0, 12);
  }
  if (allAnt.length) {
    result.antonyms = Array.from(new Set(allAnt.map((w) => w.toLowerCase()))).slice(0, 8);
  }
  return result;
}

function pickThesaurusForWord(thesJson: unknown, word: string): any | null {
  if (!Array.isArray(thesJson) || thesJson.length === 0) return null;
  if (typeof thesJson[0] === "string") return null;
  const lower = word.toLowerCase();
  const matching = (thesJson as any[]).find(
    (e) => isObj(e) && isObj(e.meta) && typeof e.meta.id === "string" &&
      e.meta.id.toLowerCase().split(":")[0] === lower
  );
  return matching ?? (thesJson as any[])[0];
}

/**
 * Parse the MW Collegiate Dictionary + Thesaurus JSON into our DictionaryEntry.
 * Returns null and an optional suggestions list when the word isn't in MW.
 */
export function parseMwEntry(
  dictJson: unknown,
  thesJson: unknown | null,
  queriedWord: string
): { entry: DictionaryEntry | null; suggestions?: string[] } {
  if (Array.isArray(dictJson) && dictJson.length > 0 && typeof dictJson[0] === "string") {
    return { entry: null, suggestions: dictJson.slice(0, 10) as string[] };
  }
  if (!Array.isArray(dictJson) || dictJson.length === 0) return { entry: null };

  const lowerQuery = queriedWord.toLowerCase();
  const matchingEntry = (dictJson as any[]).find(
    (e) => isObj(e) && isObj(e.meta) && typeof e.meta.id === "string" &&
      e.meta.id.toLowerCase().split(":")[0] === lowerQuery
  );
  const entry: any = matchingEntry ?? dictJson[0];
  if (!isObj(entry)) return { entry: null };

  const meta = isObj(entry.meta) ? entry.meta : {};
  const wordId = typeof meta.id === "string"
    ? meta.id.split(":")[0].toLowerCase()
    : queriedWord.toLowerCase();

  const { prs } = parseMwHeadword(entry);
  const phonetic = prs[0]?.ipa;
  const audioUrl = prs[0]?.audioUrl;

  const partOfSpeech =
    typeof entry.fl === "string" && entry.fl.trim() ? entry.fl.trim().toLowerCase() : "unknown";

  let definitions: Definition[] = [];
  if (Array.isArray(entry.def)) {
    for (const d of entry.def) {
      if (!isObj(d)) continue;
      const senses = parseMwSenseSequence(d.sseq);
      for (const s of senses) {
        if (s.definition) {
          definitions.push({
            definition: s.definition,
            segments: s.segments,
            example: s.example,
            exampleSegments: s.exampleSegments,
          });
        }
      }
    }
  }
  if (definitions.length === 0 && Array.isArray(entry.shortdef)) {
    definitions = (entry.shortdef as string[])
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => ({ definition: stripInlineMarkup(s) }));
  }
  if (definitions.length === 0) return { entry: null };

  const thesEntry = pickThesaurusForWord(thesJson, queriedWord);
  let synonyms: string[] | undefined;
  let antonyms: string[] | undefined;
  if (thesEntry) {
    const t = parseMwThesaurusSynonyms(thesEntry);
    synonyms = t.synonyms;
    antonyms = t.antonyms;
  }

  let etymology: string | undefined;
  let etymologySegments: DefSegment[] | undefined;
  if (Array.isArray(entry.et)) {
    const segs: DefSegment[] = [];
    for (const item of entry.et) {
      if (Array.isArray(item) && item.length >= 2 && item[0] === "text" && typeof item[1] === "string") {
        if (segs.length) segs.push({ text: " " });
        mwTokenize(item[1], {}, segs);
      }
    }
    if (segs.length) {
      etymologySegments = tidySegments(segs);
      etymology = segmentsToPlainText(etymologySegments);
    }
  }

  const firstKnownUse =
    typeof entry.date === "string" && entry.date.trim()
      ? stripInlineMarkup(entry.date.trim())
      : undefined;

  const result: DictionaryEntry = {
    word: wordId,
    phonetic,
    phonetics: prs.map((p) => ({ text: p.ipa, audio: p.audioUrl })),
    partOfSpeech,
    definitions,
    synonyms,
    antonyms,
    etymology,
    etymologySegments,
    origin: undefined,
    firstKnownUse,
    audioUrl,
    source: "merriam-webster",
  };
  return { entry: result };
}

export async function fetchMwDictionary(word: string, dictKey: string): Promise<unknown> {
  const url = `${MW_DICT_BASE}/${encodeURIComponent(word.toLowerCase())}?key=${dictKey}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    if (res.status === 429) throw new Error("Merriam-Webster rate limit reached. Please try again shortly.");
    throw new Error(`Merriam-Webster API error: ${res.status}`);
  }
  return await res.json();
}

export async function fetchMwThesaurus(word: string, thesKey: string): Promise<unknown | null> {
  const url = `${MW_THES_BASE}/${encodeURIComponent(word.toLowerCase())}?key=${thesKey}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ============================================================================ */
/* Wiktionary adapter                                                            */
/* ============================================================================ */

const WT_API = "https://en.wiktionary.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "WebsterFreeDictionary/1.0 (https://github.com/webster-free; contact@example.com)";

// Section headers we recognize as parts of speech.
const POS_SECTIONS = new Map<string, string>([
  ["noun", "noun"],
  ["proper noun", "proper noun"],
  ["verb", "verb"],
  ["adjective", "adjective"],
  ["adverb", "adverb"],
  ["pronoun", "pronoun"],
  ["preposition", "preposition"],
  ["conjunction", "conjunction"],
  ["interjection", "interjection"],
  ["determiner", "determiner"],
  ["article", "article"],
  ["numeral", "numeral"],
  ["participle", "participle"],
  ["particle", "particle"],
  ["suffix", "suffix"],
  ["prefix", "prefix"],
  ["initialism", "initialism"],
  ["acronym", "acronym"],
  ["contraction", "contraction"],
  ["phrase", "phrase"],
  ["idiom", "idiom"],
  ["proverb", "proverb"],
  ["letter", "letter"],
  ["symbol", "symbol"],
  ["character", "character"],
  ["number", "number"],
  ["cardinal number", "cardinal number"],
  ["ordinal number", "ordinal number"],
]);

/**
 * Fetch raw wikitext for a word from the English Wiktionary Action API.
 * Returns null if the page doesn't exist.
 */
export async function fetchWiktionaryWikitext(
  word: string
): Promise<string | null> {
  const url = `${WT_API}?action=parse&page=${encodeURIComponent(
    word.toLowerCase()
  )}&prop=wikitext&format=json&formatversion=2`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Missing title → returns an error object with code "missingtitle"
    if (data?.error?.code === "missingtitle") return null;
    if (data?.error) return null;
    const wikitext: string | undefined = data?.parse?.wikitext;
    return wikitext ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch "Did you mean…?" suggestions for a misspelled word via the
 * OpenSearch endpoint. Returns a list of up to 10 suggestions.
 */
export async function fetchWiktionarySuggestions(
  word: string
): Promise<string[]> {
  const url = `${WT_API}?action=opensearch&search=${encodeURIComponent(
    word.toLowerCase()
  )}&limit=10&namespace=0&format=json`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    // OpenSearch returns: [query, [titles], [descriptions], [urls]]
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return (data[1] as string[]).filter((s) => typeof s === "string").slice(0, 10);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Resolve the direct media URL for a Commons-hosted audio file via the
 * imageinfo API. Returns null if the file doesn't exist.
 */
export async function fetchWiktionaryAudioUrl(
  audioFilename: string
): Promise<string | null> {
  // Normalize: strip "File:" prefix, ensure capitalized "File:" for the title
  const cleanName = audioFilename.replace(/^File:/i, "").replace(/ /g, "_");
  const url = `${COMMONS_API}?action=query&prop=imageinfo&iiprop=url&titles=File:${encodeURIComponent(
    cleanName
  )}&format=json&formatversion=2`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!Array.isArray(pages) || pages.length === 0) return null;
    const info = pages[0]?.imageinfo;
    if (!Array.isArray(info) || info.length === 0) return null;
    const directUrl: string | undefined = info[0]?.url;
    // Strip the utm_* query params Wikimedia appends — they're tracking params
    // and don't affect the file content.
    if (directUrl) {
      try {
        const u = new URL(directUrl);
        u.searchParams.delete("utm_source");
        u.searchParams.delete("utm_campaign");
        u.searchParams.delete("utm_content");
        return u.toString();
      } catch {
        return directUrl;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------- wikitext markup stripping ---------- */

/** Map common ISO 639-1/2/3 codes to readable language names. */
const LANG_NAMES: Record<string, string> = {
  en: "English",
  enm: "Middle English",
  ang: "Old English",
  fro: "Old French",
  frm: "Middle French",
  fr: "French",
  la: "Latin",
  "la-lat": "Late Latin",
  "la-med": "Medieval Latin",
  "la-ecc": "Ecclesiastical Latin",
  "la-vul": "Vulgar Latin",
  "la-new": "New Latin",
  grc: "Ancient Greek",
  el: "Greek",
  gem: "Germanic",
  "gem-pro": "Proto-Germanic",
  "gem-frm": "Middle High German",
  "gmh": "Middle High German",
  "goh": "Old High German",
  non: "Old Norse",
  de: "German",
  yid: "Yiddish",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  ca: "Catalan",
  oc: "Occitan",
  ro: "Romanian",
  ru: "Russian",
  cs: "Czech",
  pl: "Polish",
  sla: "Slavic",
  "sla-pro": "Proto-Slavic",
  sa: "Sanskrit",
  hi: "Hindi",
  ar: "Arabic",
  fa: "Persian",
  he: "Hebrew",
  ie: "Indo-European",
  "ine-pro": "Proto-Indo-European",
  "ine-eme": "Early Modern Indo-European",
  cu: "Church Slavonic",
  ga: "Irish",
  cy: "Welsh",
  gd: "Scottish Gaelic",
  br: "Breton",
  nl: "Dutch",
  afr: "Afrikaans",
  da: "Danish",
  sv: "Swedish",
  no: "Norwegian",
  fi: "Finnish",
  hu: "Hungarian",
  tr: "Turkish",
  et: "Estonian",
  ja: "Japanese",
  zh: "Chinese",
  "zh-cn": "Mandarin Chinese",
  "zh-min-nan": "Min Nan",
  ko: "Korean",
  vi: "Vietnamese",
  th: "Thai",
};

function langName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const lc = code.toLowerCase();
  return LANG_NAMES[lc] ?? LANG_NAMES[lc.split("-")[0]];
}

/**
 * Extract the display term (and optional alt + gloss) from a positional-arg
 * template like `{{der|en|fro|fomenter|alt|gloss}}`.
 *
 * Args layout (for etymology templates like {{inh}}, {{der}}, {{bor}}, {{cog}},
 * {{m}}, {{mention}}):
 *   1: destination language ("en")
 *   2: source language code
 *   3: the term in the source language
 *   4: alt display form (optional — if non-empty, prefer this over arg 3)
 *   5: gloss (optional)
 *
 * Returns the displayed word, or "" if the template doesn't match.
 */
function extractTermFromTemplate(inner: string): {
  word?: string;
  srcLang?: string;
  gloss?: string;
} {
  const args = inner.split("|").map((s) => s.trim());
  if (args.length < 2) return {};
  // Skip named params; collect positional args
  const positional: string[] = [];
  for (const a of args) {
    if (/^[a-z0-9_]+=/i.test(a)) continue;
    positional.push(a);
  }
  if (positional.length === 0) return {};
  // First positional arg is the template name; skip it
  const [name, ...rest] = positional;
  if (!name) return {};
  // For {{inh|en|enm|word|alt|gloss}}, rest[0]="en", rest[1]="enm", rest[2]="word"
  // For {{m|la|word|alt|gloss}}, rest[0]="la", rest[1]="word"
  // For {{cog|la|word}}, rest[0]="la", rest[1]="word"
  // We need to detect whether the first remaining arg is a destination language code
  // ("en") or a source language code ("la").
  let srcLang: string | undefined;
  let term: string | undefined;
  let alt: string | undefined;
  let gloss: string | undefined;

  // Strip [[link]] markers from each positional arg
  const cleaned = rest.map((s) =>
    s
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/'''/g, "")
      .replace(/''/g, "")
  );

  if (name.toLowerCase() === "m" || name.toLowerCase() === "mention" || name.toLowerCase() === "cog" || name.toLowerCase() === "noncog") {
    // {{m|lang|term|alt|gloss}} — no destination lang
    srcLang = cleaned[0];
    term = cleaned[1];
    alt = cleaned[2];
    gloss = cleaned[3];
  } else {
    // {{der|en|lang|term|alt|gloss}}
    srcLang = cleaned[1];
    term = cleaned[2];
    alt = cleaned[3];
    gloss = cleaned[4];
  }

  return {
    word: alt || term,
    srcLang,
    gloss,
  };
}

/**
 * Strip most wikitext markup so a definition reads cleanly. The result is not
 * markdown — it's plain text.
 */
function stripWikitext(s: string): string {
  let out = s;
  // Remove HTML comments <!-- ... -->
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  // Remove '''bold''' and ''italic''
  out = out.replace(/'{2,5}/g, "");
  // Remove reference tags <ref>...</ref>
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  out = out.replace(/<ref[^>]*\/>/gi, "");
  // Remove other HTML tags
  out = out.replace(/<[^>]+>/g, "");
  // Convert [[wikilink|display]] → display, [[wikilink]] → wikilink
  out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_m, inner) => {
    if (inner.includes(":")) {
      const parts = inner.split(":");
      return parts[parts.length - 1];
    }
    return inner;
  });
  // {{w|Article Title|Display Title}} → Display Title (or Article Title if no display)
  out = out.replace(
    /\{\{w\|([^}]+)\}\}/gi,
    (_m, inner) => {
      const args = inner.split("|");
      // First positional is the article title; second is the display (if any)
      const positional: string[] = [];
      for (const a of args) {
        if (/^[a-z0-9_]+=/i.test(a)) continue;
        positional.push(a.trim());
      }
      const display = positional[1] || positional[0] || "";
      return display
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1");
    }
  );
  // Etymology templates: {{inh|en|lang|word|alt}}, {{der|...}}, {{bor|...}},
  // {{cog|lang|word|alt}}, {{m|lang|word|alt}}, {{mention|lang|word|alt}}
  out = out.replace(
    /\{\{(inh|der|bor|lbor|sbor|slbor|learned borrowing| borrowed|inh-eth|borrowed|der-eth|borrowed borrowing|back-formation|cf|cog|noncog|etyl|m|mention)\|([^}]+)\}\}/gi,
    (_m, _name, inner) => {
      const { word, srcLang, gloss } = extractTermFromTemplate(_name + "|" + inner);
      const ln = langName(srcLang);
      // Build "language: word (gloss)" when language is known
      if (word && ln) {
        return gloss ? `${ln} ${word} (${gloss})` : `${ln} ${word}`;
      }
      if (word) return word;
      return "";
    }
  );
  // {{suffix|en|base|...|affix|...}} → "base + affix"
  out = out.replace(
    /\{\{(?:suffix|suf|prefix|pref|affix|af|compound|com)\|(?:en\|)?([^|}]+)([^}]+)\}\}/gi,
    (_m, first, rest) => {
      const words: string[] = [first];
      for (const part of rest.split("|")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (/^[a-z0-9_]+=/i.test(trimmed)) continue;
        const cleaned = trimmed
          .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
          .replace(/\[\[([^\]]+)\]\]/g, "$1");
        if (cleaned && !/^[a-z0-9_]+=/i.test(cleaned)) {
          words.push(cleaned);
        }
      }
      return words.filter(Boolean).join(" + ");
    }
  );
  // {{coin|en|author|...|in=year|...}} → "Coined by author in year"
  out = out.replace(
    /\{\{coin\|(?:en\|)?([^|}]+)([^}]+)\}\}/gi,
    (_m, author, rest) => {
      const yearMatch = rest.match(/\bin=([0-9]{3,4})/);
      const yr = yearMatch ? ` in ${yearMatch[1]}` : "";
      const a = author
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1");
      return `Coined by ${a}${yr}`;
    }
  );
  // {{root|en|ine-pro|*root}} → ignore (just metadata)
  out = out.replace(/\{\{root\|[^}]+\}\}/gi, "");
  // Remove most other {{templates}}
  out = out.replace(/\{\{[^}]*\}\}/g, "");
  // Collapse multiple spaces
  out = out.replace(/[ \t]{2,}/g, " ");
  // Trim each line and remove trailing whitespace
  out = out
    .split("\n")
    .map((l) => l.trim())
    .join("\n");
  // Collapse 3+ blank lines into 2
  out = out.replace(/\n{3,}/g, "\n\n");
  // Fix " ," → "," and " ." → "."
  out = out.replace(/\s+([,.;:!?])/g, "$1");
  return out.trim();
}

/**
 * Extract synonyms or antonyms from a line like:
 *   "Synonyms: foo, bar, baz"
 *   "Antonyms: [[foo]], [[bar]]"
 * Returns null if the line doesn't start with the given label.
 */
function extractInlineList(
  line: string,
  label: "Synonyms" | "Antonyms"
): string[] | null {
  const re = new RegExp(`^${label}\\s*:`, "i");
  if (!re.test(line)) return null;
  const after = line.replace(re, "").trim();
  if (!after) return [];
  return after
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/'''/g, "").replace(/^[[\]()'"`]+|[()[\]'"`]+$/g, ""));
}

/** Pull all `{{audio|en|file.ogg|...}}` filenames out of a wikitext block. */
function extractAudioFilenames(wikitext: string): string[] {
  const re = /\{\{audio\|(?:en|en-us|en-uk|en-au)\|([^|}]+)\|/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    out.push(m[1].trim());
  }
  // De-dupe preserving order
  return Array.from(new Set(out));
}

/** Pull all IPA strings out of `{{IPA|...}}` and `{{IPAchar|...}}` templates. */
function extractIpa(wikitext: string): string[] {
  const out: string[] = [];
  // Find every {{IPA|...}} or {{IPAchar|...}} template
  const re = /\{\{(?:IPA|IPAchar|ipa)\|([^}]+)\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const inner = m[1];
    // Inside the template, find every "/.../" or "[...]" IPA token.
    // (Named params like `a=UK` don't contain `/.../` so they're naturally skipped.)
    const ipaRe = /\/[^/\n]+\//g;
    let ipaM: RegExpExecArray | null;
    while ((ipaM = ipaRe.exec(inner)) !== null) {
      const ipa = ipaM[0].trim();
      if (!out.includes(ipa)) out.push(ipa);
    }
    const bracketRe = /\[[^\]\n]+\]/g;
    while ((ipaM = bracketRe.exec(inner)) !== null) {
      const ipa = ipaM[0].trim();
      if (!out.includes(ipa)) out.push(ipa);
    }
  }
  return out;
}

/** Pull all words out of `{{syn|en|word1|word2|...}}` templates. */
function extractSynAntTemplates(
  wikitext: string,
  template: "syn" | "ant"
): string[] {
  const re = new RegExp(`\\{\\{${template}\\|en\\|([^}]*)\\}\\}`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const inner = m[1];
    inner
      .split("|")
      .map((s) => s.trim())
      .filter((s) => s && !s.includes("=") && !s.startsWith("q1="))
      .forEach((s) => {
        // Strip [[ ... ]] link syntax
        let cleaned = s
          .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
          .replace(/\[\[([^\]]+)\]\]/g, "$1");
        // Strip Wiktionary namespace links like "Thesaurus:luck" or
        // "Category:Nouns" — these are not real synonyms/antonyms.
        if (/^(Thesaurus|Category|Wiktionary|Help|File|Template|Wikipedia):/i.test(cleaned)) {
          cleaned = cleaned.replace(/^.*:/, "");
          // Skip pure namespace references — they're not synonyms themselves.
          return;
        }
        if (cleaned) out.push(cleaned);
      });
  }
  return out;
}

/* ---------- section splitting ---------- */

/**
 * Split wikitext into top-level language sections (== English ==,
 * == Translingual ==, etc.). We only care about the English section
 * (and possibly Translingual as a fallback for currency symbols etc.).
 *
 * Wiktionary wikitext uses `==English==` (no spaces around the title) as the
 * canonical form, but `== English ==` (with spaces) is also accepted.
 */
function findLanguageSection(wikitext: string, lang: string): string | null {
  // Match `==\s*lang\s*==` at the start of a line (case-insensitive).
  const headerRe = new RegExp(`(^|\\n)==\\s*${lang}\\s*==\\n`, "i");
  const m = wikitext.match(headerRe);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  // Find the next top-level `== Title ==` header at column 0.
  const after = wikitext.slice(start);
  const next = after.match(/\n==\s*[^=\n]+\s*==\n/);
  if (next && next.index !== undefined) {
    return after.slice(0, next.index).trim();
  }
  return after.trim();
}

/**
 * Split a language section into sub-sections keyed by sub-section title.
 * Returns an ordered list of { title: string; body: string }.
 */
function splitSubsections(sectionWikitext: string): {
  title: string;
  body: string;
}[] {
  const lines = sectionWikitext.split("\n");
  const out: { title: string; body: string }[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  const flush = () => {
    if (currentTitle || currentBody.length) {
      out.push({
        title: currentTitle,
        body: currentBody.join("\n").trim(),
      });
    }
    currentTitle = "";
    currentBody = [];
  };

  for (const line of lines) {
    // === Title === (or deeper: ==== Title ====)
    const m = line.match(/^(={2,})\s*(.+?)\s*\1\s*$/);
    if (m) {
      flush();
      currentTitle = m[2].trim();
      continue;
    }
    currentBody.push(line);
  }
  flush();
  return out;
}

/* ---------- the big parser ---------- */

export interface ParsedWiktionaryEntry {
  word: string;
  partOfSpeech: string;
  definitions: Definition[];
  phonetic?: string;
  audioFilenames: string[];
  etymology?: string;
  synonyms: string[];
  antonyms: string[];
}

/**
 * Parse a Wiktionary wikitext blob into a structured entry. We only extract
 * the English-language section (with a Translingual fallback for symbols).
 */
export function parseWikitextEntry(
  wikitext: string,
  queriedWord: string
): ParsedWiktionaryEntry | null {
  if (!wikitext) return null;
  const english = findLanguageSection(wikitext, "English") ||
    findLanguageSection(wikitext, "Translingual") ||
    findLanguageSection(wikitext, "Translingual");

  if (!english) return null;

  const subs = splitSubsections(english);

  let partOfSpeech = "unknown";
  let phonetic: string | undefined;
  let audioFilenames: string[] = [];
  let etymology: string | undefined;
  let definitions: Definition[] = [];
  const allSynonyms: string[] = [];
  const allAntonyms: string[] = [];
  let currentDefinition: Definition | null = null;

  for (const sub of subs) {
    const title = sub.title.toLowerCase().trim();

    if (title === "pronunciation") {
      const ipas = extractIpa(sub.body);
      if (ipas.length > 0 && !phonetic) phonetic = ipas[0];
      const audio = extractAudioFilenames(sub.body);
      if (audio.length > 0) audioFilenames = audio;
      continue;
    }

    if (title === "etymology" || title.startsWith("etymology")) {
      // Strip templates/links and gather as plain text
      const cleaned = stripWikitext(sub.body);
      if (cleaned) etymology = cleaned;
      continue;
    }

    const posMatch = POS_SECTIONS.get(title);
    if (posMatch) {
      // If we've already collected definitions from a previous POS section
      // (e.g. Verb came before Noun), skip subsequent POS sections so we
      // don't mix verb and noun senses under a single POS label.
      if (definitions.length > 0) {
        continue;
      }
      partOfSpeech = posMatch;

      // Templates like {{syn|en|foo|bar}} at section level
      for (const s of extractSynAntTemplates(sub.body, "syn")) {
        if (!allSynonyms.includes(s)) allSynonyms.push(s);
      }
      for (const a of extractSynAntTemplates(sub.body, "ant")) {
        if (!allAntonyms.includes(a)) allAntonyms.push(a);
      }

      // Also pick up audio/IPA declared at the POS level (some entries do this)
      if (!phonetic) {
        const ipas = extractIpa(sub.body);
        if (ipas.length > 0) phonetic = ipas[0];
      }
      if (audioFilenames.length === 0) {
        const audio = extractAudioFilenames(sub.body);
        if (audio.length > 0) audioFilenames = audio;
      }

      // Walk lines, collecting # definitions and #: examples
      const lines = sub.body.split("\n");
      const flushCurrent = () => {
        if (currentDefinition) {
          definitions.push(currentDefinition);
          currentDefinition = null;
        }
      };

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        // Definition line: starts with "# "
        if (/^#\s/.test(line) && !/^#:/.test(line)) {
          flushCurrent();
          const body = line.replace(/^#\s*/, "");
          // Strip leading templates and markup
          const cleanedDef = stripWikitext(body);
          if (cleanedDef) {
            currentDefinition = {
              definition: cleanedDef,
              // Pull per-definition inline synonyms/antonyms if present
              synonyms: undefined,
              antonyms: undefined,
            };
            // If the definition line itself ends with "Synonyms: foo, bar",
            // capture those.
            const lineSyn = extractInlineList(cleanedDef, "Synonyms");
            if (lineSyn) {
              currentDefinition.synonyms = lineSyn;
              currentDefinition.definition = cleanedDef
                .replace(/^Synonyms:[^]*$/i, "")
                .replace(/Synonyms:[^]*$/i, "")
                .trim();
            }
          }
          continue;
        }
        // Example line: starts with "#:"
        if (/^#:/.test(line)) {
          const body = line.replace(/^#:\s*/, "");
          const cleaned = stripWikitext(body);
          if (cleaned) {
            if (currentDefinition) {
              if (currentDefinition.example) {
                currentDefinition.example += " " + cleaned;
              } else {
                currentDefinition.example = cleaned;
              }
            }
          }
          continue;
        }
        // Inline synonyms/antonyms following a definition (no # prefix)
        const trimmed = line.trim();
        if (currentDefinition) {
          const syn = extractInlineList(trimmed, "Synonyms");
          if (syn) {
            currentDefinition.synonyms = [
              ...(currentDefinition.synonyms ?? []),
              ...syn,
            ];
            continue;
          }
          const ant = extractInlineList(trimmed, "Antonyms");
          if (ant) {
            currentDefinition.antonyms = [
              ...(currentDefinition.antonyms ?? []),
              ...ant,
            ];
            continue;
          }
        }
        // Loose inline synonyms/antonyms at section level
        const secSyn = extractInlineList(trimmed, "Synonyms");
        if (secSyn) {
          secSyn.forEach((s) => {
            if (!allSynonyms.includes(s)) allSynonyms.push(s);
          });
          continue;
        }
        const secAnt = extractInlineList(trimmed, "Antonyms");
        if (secAnt) {
          secAnt.forEach((a) => {
            if (!allAntonyms.includes(a)) allAntonyms.push(a);
          });
          continue;
        }
      }
      flushCurrent();
    }
  }

  if (definitions.length === 0) {
    // Fallback: take the first paragraph of the section as a definition
    const plain = stripWikitext(english);
    const firstPara = plain.split(/\n\n/).find((p) => p.trim().length > 0);
    if (firstPara) {
      definitions = [{ definition: firstPara.trim() }];
    } else {
      return null;
    }
  }

  // Try to find a "first known use" hint in etymology (best-effort).
  let firstKnownUse: string | undefined;
  if (etymology) {
    const m = etymology.match(/\b(\d{3,4})\b/);
    if (m) firstKnownUse = m[1];
  }

  return {
    word: queriedWord.toLowerCase(),
    partOfSpeech,
    definitions,
    phonetic,
    audioFilenames,
    etymology,
    synonyms: allSynonyms,
    antonyms: allAntonyms,
    // (Wiktionary doesn't have a structured "first known use"; we heuristically
    // extract a year above, but we keep this field out of the returned entry
    // when it's a guess.)
  } as ParsedWiktionaryEntry & { firstKnownUse?: string };
}

/**
 * Build a final DictionaryEntry from a parsed Wiktionary entry, resolving the
 * direct audio URL via the Commons imageinfo API.
 */
export async function buildEntryFromWiktionary(
  parsed: ParsedWiktionaryEntry,
  queriedWord: string
): Promise<DictionaryEntry> {
  let audioUrl: string | undefined;
  if (parsed.audioFilenames.length > 0) {
    audioUrl =
      (await fetchWiktionaryAudioUrl(parsed.audioFilenames[0])) ?? undefined;
  }

  const entry: DictionaryEntry = {
    word: parsed.word || queriedWord.toLowerCase(),
    phonetic: parsed.phonetic,
    phonetics: parsed.audioFilenames.map((f) => ({
      // Text is filled in separately if needed; we just expose audio for now
      audio: f,
    })),
    partOfSpeech: parsed.partOfSpeech,
    definitions: parsed.definitions,
    synonyms: parsed.synonyms.length ? parsed.synonyms : undefined,
    antonyms: parsed.antonyms.length ? parsed.antonyms : undefined,
    etymology: parsed.etymology,
    audioUrl,
    source: "wiktionary",
  };

  return entry;
}

/* ============================================================================ */
/* Word of the Day curated list                                                  */
/* ============================================================================ */

export const WOD_CANDIDATES: string[] = [
  "serendipity", "ephemeral", "petrichor", "mellifluous", "limerence",
  "defenestrate", "luminous", "saudade", "wanderlust", "ineffable",
  "epiphany", "solitude", "halcyon", "lagniappe", "gossamer",
  "umbra", "cynosure", "vermilion", "ebullient", "surreptitious",
  "venerable", "pernicious", "loquacious", "perspicacious", "obfuscate",
  "fastidious", "lugubrious", "garrulous", "magnanimous", "ubiquitous",
  "esoteric", "quintessential", "pellucid", "susurration",
  "palimpsest", "sempiternal", "inveterate", "obstreperous", "iridescent",
  "lucid", "august", "chimera", "phantasmagoria",
  "ennui", "verdant", "vestige", "lissome", "lithe",
  "winsome", "felicity", "sublime", "ethereal", "diaphanous",
  "limpid", "celadon", "svelte", "tristful", "valedictory",
  "liminal", "effervescent", "mondegreen", "solivagant", "selcouth",
  "redamancy", "psithurism", "sillage", "apricity",
  "viridescence", "welter", "yearning", "zephyr",
  "abscond", "aberrant", "abnegate", "abstruse", "acumen",
  "adroit", "aesthete", "affable", "alacrity", "amiable",
  "anachronism", "anomalous", "antediluvian", "aplomb", "apocryphal",
  "arcane", "ascetic", "aspersion", "assiduous", "atavistic",
  "audacious", "auspicious", "austere", "avarice", "balm",
  "beatitude", "beleaguer", "benediction", "benison",
  "berate", "bewilder", "blatant", "bolster", "bombast",
  "boor", "boondoggle", "boscage", "bravado", "brevity",
  "bristle", "broach", "brusque", "bucolic", "bulwark",
  "burgeon", "byzantine", "cabal", "cacophony", "cadaverous",
  "cajole", "calamitous", "callous", "calumniate", "camaraderie",
  "candor", "cantankerous", "capacious", "capitulate", "capricious",
  "castigate", "cataclysm", "catalyst", "catharsis", "catholic",
  "caustic", "celerity", "censor", "cerebral", "chagrin",
  "chicanery", "chimerical", "chivalrous", "circuitous", "citadel",
  "clandestine", "clemency", "coalesce", "coda", "cogent",
  "cogitate", "cognate", "cognition", "commensurate", "compendious",
  "complaisant", "confluence", "conundrum", "convivial", "copious",
  "cordial", "corollary", "corroborate", "credulous", "culpable",
  "cursory", "curtail", "cynic", "dais", "decorum",
  "deference", "defunct", "delineate", "demagogue", "demitasse",
  "demulcent", "denigrate", "deplete", "deprecate", "derelict",
  "deride", "desiccate", "desultory", "dexterity", "diaphanous",
  "diatribe", "dichotomy", "didactic", "diffidence", "dilatory",
  "dilettante", "diminutive", "discern", "disparage", "dissemble",
  "dissonance", "doctrinaire", "doleful", "dolorous", "dolt",
  "dotage", "droll", "drudgery", "duplicity", "duress",
  "ebullient", "edify", "effigy", "effrontery", "egalitarian",
  "egocentric", "egregious", "elegy", "emaciate", "emasculate",
  "embezzle", "emollient", "emolument", "empyrean", "encomium",
  "endemic", "enervate", "enigma", "enmity", "ennui",
  "ensconce", "entreat", "ephemeral", "epicurean", "epigone",
  "epigram", "epiphany", "epistolary", "equanimity", "equivocal",
  "erudite", "eschew", "esoteric", "espouse", "ethereal",
  "etiology", "eulogy", "euphemism", "euphony", "evanescent",
  "evince", "exacerbate", "exalt", "exasperate", "excise",
  "exculpate", "execrable", "exegesis", "exemplar", "exhort",
  "exiguous", "exodus", "exotic", "expatiate", "expatriate",
  "expiate", "expurgate", "extant", "extemporaneous", "extenuate",
  "extirpate", "extol", "extrapolate", "fatuous", "faux",
  "feckless", "fecund", "feint", "felicitous",
  "fervid", "fervor", "fete", "fiat", "filch",
  "finagle", "fissure", "flagrant", "flippant", "florid",
  "flout", "flux", "foible", "foment", "foolhardy",
  "fop", "fortuitous", "fractious", "fraught", "froward",
  "frugal", "fulminate", "fulsome", "furtive", "gait",
  "garrulous", "gauche", "gaudy", "gawk", "genealogy",
  "generosity", "genteel", "germane", "gestate",
  "glib", "glower", "goad", "gossamer", "grandiloquent",
  "grandstand", "gratuitous", "gravity", "gregarious", "grimace",
  "grisly", "grudging", "guffaw", "guile", "gullible",
  "gumption", "gustatory", "halcyon", "hallow", "harangue",
  "harbinger", "hardy", "harp", "haughty", "hector",
  "hedonism", "hefty", "hegemony", "heinous", "heresy",
  "hermetic", "heyday", "hiatus", "hierarchy", "histrionic",
  "hobbledehoy", "hoary", "hobnob", "hone", "hubris",
  "hubbub", "humdrum", "hyperbole", "hypocrite", "iconoclast",
  "idyllic", "ignoble", "ignominy", "ilk", "illimitable",
  "illuminati", "illusory", "imbibe", "immaculate", "imminent",
  "immolate", "impair", "impale", "impassive", "impeccable",
  "impede", "impel", "impenitent", "imperious", "impervious",
  "implacable", "implausible", "implement", "implicate", "implicit",
  "importune", "impotent", "impugn", "impecunious", "ineffable",
  "inadvertent", "inalienable", "inane", "inanimate", "inarticulate",
  "incandescent", "incarnate", "incense", "incessant", "inchoate",
  "incidence", "incipient", "incisive", "incite", "inclement",
  "inclination", "incognito", "incoherent", "incongruous", "incorrigible",
  "increment", "incriminate", "incubus", "incur", "indelible",
  "indemnify", "indigent", "indignant", "indolent", "indomitable",
  "indubitable", "indulge", "inebriated", "inertia", "inexorable",
  "infallible", "infamy", "infer", "infidel", "infirmity",
  "inflated", "influx", "ingenuous", "ingrained", "inkling",
  "innate", "innocuous", "innovate", "innuendo", "insatiable",
  "inscrutable", "insidious", "insolent", "instigate",
  "insular", "insuperable", "intemperate", "interdict", "interim",
  "interminable", "interpolate", "interpose", "intimate", "intrepid",
  "introspection", "intrude", "inundate", "inured", "invective",
  "inveigh", "inveigle", "inverse", "inveterate", "invidious",
  "inviolable", "invocation", "invulnerable", "irascible", "irate",
  "iridescent", "irony", "irreverent", "irrevocable", "itinerant",
  "jaded", "jargon", "jaundiced", "jejune", "jeremiad",
  "jettison", "jingoism", "jocose", "jovial", "jubilee",
  "judicious", "junta", "jurisprudence", "justifiable", "kindle",
  "kindred", "knack", "knavery", "knead",
];

/** Pick today's Word of the Day candidate deterministically by day-of-year. */
export function todaysWodCandidate(now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86_400_000);
  const idx = dayOfYear % WOD_CANDIDATES.length;
  return WOD_CANDIDATES[idx];
}
