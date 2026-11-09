/**
 * Parser tests for the MW markup tokenizer in src/lib/dictionary.ts.
 *
 * Fixtures are taken verbatim from Merriam-Webster's published JSON data-model
 * documentation (dictionaryapi.com/products/json, sections 2.10–2.29) and from
 * the live m-w.com rendering of "engine" — so every case is real API data, not
 * invention.
 *
 * Run: bun scripts/test-mw-parser.ts
 */
import { parseMwEntry } from "../src/lib/dictionary";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}\n      expected: ${e}\n      actual:   ${a}`);
  }
}

/* ------------------------------------------------------------------ */
/* 1. Full sense payloads through parseMwEntry (dt + sls + sdsense)   */
/* ------------------------------------------------------------------ */

// engine, noun sense 1 (sdsense "also") — live-site regression: the old parser
// dropped the sdsense text entirely.
const engine = parseMwEntry(
  [
    {
      meta: { id: "engine:1" },
      hwi: { hw: "en*gine", prs: [{ ipa: "ˈen-jən", sound: { audio: "engine01" } }] },
      fl: "noun",
      def: [
        {
          sseq: [
            [
              [
                "sense",
                {
                  sn: "1",
                  dt: [
                    [
                      "text",
                      " {bc} a machine for converting any of various forms of energy into mechanical force and motion ",
                    ],
                  ],
                  sdsense: {
                    sd: "also",
                    dt: [
                      [
                        "text",
                        " {bc} a mechanism or object that serves as an energy source ",
                      ],
                    ],
                  },
                },
              ],
            ],
            [
              [
                "sense",
                {
                  sn: "3 a",
                  dt: [
                    [
                      "text",
                      " {bc} something used to effect a purpose {bc}{sx|agent||}, {sx|instrument||} ",
                    ],
                  ],
                },
              ],
            ],
            [
              [
                "sense",
                {
                  sn: "4 a",
                  dt: [["text", " {bc}{d_link|machinery|machinery} "]],
                },
              ],
            ],
            [
              [
                "sense",
                {
                  sn: "4 b",
                  dt: [
                    ["text", " {bc} any of various mechanical appliances "],
                    [
                      "uns",
                      [["text", "often used in combination {phrase}fire engine{/phrase}"]],
                    ],
                  ],
                },
              ],
            ],
            [
              [
                "sense",
                {
                  sn: "6 a",
                  sls: ["obsolete"],
                  dt: [["text", " {bc}{dxt|ingenuity||} "]],
                },
              ],
            ],
          ],
        },
      ],
      et: [
        [
          "text",
          "Middle English {it}engin{/it}, from Anglo-French, from Latin {it}ingenium{/it}, from {it}ingenerare{/it} to engender, from {it}in-{/it} + {it}generare{/it} to generate {ma}{mat|engine|}{/ma}",
        ],
      ],
      date: "14th century",
    },
  ],
  null,
  "engine"
);

const defs = engine.entry!.definitions;
check(
  "engine sense 1 plain text (sdsense inlined after semicolon)",
  defs[0].definition,
  "a machine for converting any of various forms of energy into mechanical force and motion; also: a mechanism or object that serves as an energy source"
);
check(
  "engine sense 3a plain text",
  defs[1].definition,
  "something used to effect a purpose: agent, instrument"
);
check(
  "engine sense 3a blue links",
  defs[1].segments?.filter((s) => s.href).map((s) => `${s.text}->${s.href}`),
  ["agent->agent", "instrument->instrument"]
);
check(
  "engine sense 4a blue link (machinery)",
  defs[2].segments?.filter((s) => s.href).map((s) => `${s.text}->${s.href}`),
  ["machinery->machinery"]
);
check(
  "engine sense 4b usage note kept (was dropped before)",
  defs[3].definition,
  "any of various mechanical appliances — often used in combination fire engine"
);
check(
  "engine sense 4b fire engine is bold-italic phrase",
  defs[3].segments?.find((s) => s.text === "fire engine"),
  { text: "fire engine", bold: true, italic: true }
);
check(
  "engine sense 6a obsolete label + blue link",
  defs[4].definition,
  "obsolete: ingenuity"
);
check(
  "engine sense 6a segments",
  defs[4].segments,
  [
    { text: "obsolete", italic: true },
    { text: ": " },
    { text: "ingenuity", href: "ingenuity", italic: true },
  ]
);
check(
  "engine etymology plain text",
  engine.entry!.etymology,
  "Middle English engin, from Anglo-French, from Latin ingenium, from ingenerare to engender, from in- + generare to generate — more at engine"
);
check(
  "engine etymology segments: italic latin + blue more-at",
  engine.entry!.etymologySegments?.filter((s) => s.italic).map((s) => s.text),
  ["engin", "ingenium", "ingenerare", "in-", "generare", "engine"]
);
check(
  "engine etymology mat link target",
  engine.entry!.etymologySegments?.find((s) => s.text === "engine")?.href,
  "engine"
);

/* ------------------------------------------------------------------ */
/* 2. MW docs example: "fowl" — dx, dx_def, d_link, dxt sense suffix   */
/* ------------------------------------------------------------------ */

const fowl = parseMwEntry(
  [
    {
      meta: { id: "fowl" },
      fl: "noun",
      def: [
        {
          sseq: [
            [
              [
                "sense",
                {
                  sn: "1",
                  dt: [
                    [
                      "text",
                      " {bc} a bird of any kind {dx} compare {dxt|waterfowl||} , {dxt|wildfowl||}{/dx} ",
                    ],
                  ],
                },
              ],
            ],
            [
              [
                "sense",
                {
                  sn: "2 a",
                  dt: [
                    [
                      "text",
                      " {bc} a cock or hen of the domestic chicken ( {it} Gallus gallus {/it} ) ",
                    ],
                  ],
                  sdsense: {
                    sd: "especially",
                    dt: [["text", " {bc} an adult hen "]],
                  },
                },
              ],
              [
                "sense",
                {
                  sn: "b",
                  dt: [
                    [
                      "text",
                      " {bc} any of several domesticated {dx_def} see {dxt|domesticate:1||2} {/dx_def} or wild {d_link|gallinaceous|gallinaceous}  birds {dx} compare {dxt|guinea fowl||} , {dxt|jungle fowl||}{/dx} ",
                    ],
                  ],
                },
              ],
            ],
          ],
        },
      ],
      et: [
        [
          "text",
          "Middle English {it} foul {/it} , from Old English {it} fugel {/it} ; akin to Old High German {it}fogal {/it} bird, and probably to Old English {it} flēogan {/it} to fly {ma}{mat|fly|}{/ma} ",
        ],
      ],
    },
  ],
  null,
  "fowl"
);

const fs = fowl.entry!.definitions;
check(
  "fowl sense 1 with em-dash dx",
  fs[0].definition,
  "a bird of any kind — compare waterfowl, wildfowl"
);
check(
  "fowl sense 1 dx links are blue",
  fs[0].segments?.filter((s) => s.href).map((s) => s.text),
  ["waterfowl", "wildfowl"]
);
check(
  "fowl sense 2a sdsense especially",
  fs[1].definition,
  "a cock or hen of the domestic chicken (Gallus gallus); especially: an adult hen"
);
check(
  "fowl sense 2a species name italic",
  fs[1].segments?.find((s) => s.italic && s.text === "Gallus gallus"),
  { text: "Gallus gallus", italic: true }
);
check(
  "fowl sense 2b dx_def parenthetical + sense number",
  fs[2].definition,
  "any of several domesticated (see domesticate sense 2) or wild gallinaceous birds — compare guinea fowl, jungle fowl"
);
check(
  "fowl sense 2b domesticate href (target field kept, homograph suffix stripped)",
  fs[2].segments?.find((s) => s.text === "domesticate")?.href,
  "domesticate"
);
check(
  "fowl sense 2b gallinaceous is a blue d_link",
  fs[2].segments?.find((s) => s.text === "gallinaceous")?.href,
  "gallinaceous"
);
check(
  "fowl etymology — more at fly",
  fowl.entry!.etymology,
  "Middle English foul, from Old English fugel; akin to Old High German fogal bird, and probably to Old English flēogan to fly — more at fly"
);

/* ------------------------------------------------------------------ */
/* 3. MW docs example: "ammonium" — inf/sup, a_link                    */
/* ------------------------------------------------------------------ */

const ammonium = parseMwEntry(
  [
    {
      meta: { id: "ammonium" },
      fl: "noun",
      def: [
        {
          sseq: [
            [
              [
                "sense",
                {
                  dt: [
                    [
                      "text",
                      " {bc} an ion NH {inf} 4 {/inf}{sup}+{/sup} derived from {a_link|ammonia} by combination with a hydrogen ion and known in compounds (such as salts) that resemble in properties the compounds of the alkali metals",
                    ],
                  ],
                },
              ],
            ],
          ],
        },
      ],
      et: [["text", "New Latin, from {it} ammonia {/it} "]],
      date: "1808",
    },
  ],
  null,
  "ammonium"
);

check(
  "ammonium sub/sup segments",
  ammonium.entry!.definitions[0].segments?.filter((s) => s.sub || s.sup),
  [{ text: "4", sub: true }, { text: "+", sup: true }]
);
check(
  "ammonium a_link is blue",
  ammonium.entry!.definitions[0].segments?.find((s) => s.text === "ammonia"),
  { text: "ammonia", href: "ammonia", italic: true }
);

/* ------------------------------------------------------------------ */
/* 4. MW docs example: "absence" — multiple {bc}, d_link with :sense   */
/* ------------------------------------------------------------------ */

const absence = parseMwEntry(
  [
    {
      meta: { id: "absence" },
      fl: "noun",
      def: [
        {
          sseq: [
            [
              [
                "sense",
                {
                  sn: "1",
                  dt: [
                    [
                      "text",
                      " {bc} a state or condition in which something expected, wanted, or looked for is not present or does not exist {bc} a state or condition in which something is {d_link|absent|absent:1} ",
                    ],
                    [
                      "vis",
                      [
                        { t: "an {wi} absence {/wi} {gloss}=lack{/gloss} of detail" },
                        {
                          t: " {phrase} In the absence of {/phrase} reform {gloss}=without reform{/gloss} , progress will be slow.",
                        },
                      ],
                    ],
                  ],
                },
              ],
            ],
          ],
        },
      ],
    },
  ],
  null,
  "absence"
);

check(
  "absence sense 1 both bc parts kept, target :1 stripped",
  absence.entry!.definitions[0].definition,
  "a state or condition in which something expected, wanted, or looked for is not present or does not exist: a state or condition in which something is absent"
);
check(
  "absence d_link target",
  absence.entry!.definitions[0].segments?.find((s) => s.text === "absent")?.href,
  "absent"
);
check(
  "absence example plain text",
  absence.entry!.definitions[0].example,
  "an absence [=lack] of detail"
);
check(
  "absence example segments",
  absence.entry!.definitions[0].exampleSegments,
  [
    { text: "an " },
    { text: "absence", italic: true },
    { text: " " },
    { text: "[" },
    { text: "=lack" },
    { text: "]" },
    { text: " of detail" },
  ]
);

/* ------------------------------------------------------------------ */
/* 5. MW docs example: Law "bona fide occupational qualification"      */
/*    — p_only dropped, tag/tagt kept as links                         */
/* ------------------------------------------------------------------ */

const bfoq = parseMwEntry(
  [
    {
      meta: { id: "bona fide occupational qualification" },
      def: [
        {
          sseq: [
            [
              [
                "sense",
                {
                  dt: [
                    [
                      "text",
                      " {bc} a requirement (as relating to sex, religion, national origin, or age) for a particular job that does not violate the constitutional bans on discrimination {dx} see also {tag}{tagt|Civil Rights Act of 1964||}{/tag} and {tag}{tagt|Age Discrimination in Employment Act||}{/tag} {p_only} in the {pdxt} Laws {/pdxt} section {/p_only}{/dx} {dx}{tag}{tagt|Equal Employment Opportunity Commission||}{/tag} {p_only} in the {pdxt} Agencies {/pdxt} section {/p_only}{/dx} {dx} compare {dxt|disparate impact||} , {dxt|disparate treatment||}{/dx} ",
                    ],
                  ],
                },
              ],
            ],
          ],
        },
      ],
    },
  ],
  null,
  "bona fide occupational qualification"
);

check(
  "law sense: print-only dropped, tagt kept",
  bfoq.entry!.definitions[0].definition,
  "a requirement (as relating to sex, religion, national origin, or age) for a particular job that does not violate the constitutional bans on discrimination — see also Civil Rights Act of 1964 and Age Discrimination in Employment Act — Equal Employment Opportunity Commission — compare disparate impact, disparate treatment"
);
check(
  "law sense: no 'Laws'/'Agencies' print-only words leak",
  /Laws|Agencies/.test(bfoq.entry!.definitions[0].definition),
  false
);

/* ------------------------------------------------------------------ */
/* 6. Edge cases                                                       */
/* ------------------------------------------------------------------ */

const edge = parseMwEntry(
  [
    {
      meta: { id: "edge" },
      fl: "noun",
      def: [
        {
          sseq: [
            [
              [
                "sense",
                {
                  dt: [
                    [
                      "text",
                      " {bc} curly quotes {ldquo}hello{rdquo} and an unknown {zork|flimflam|xx} tag and an unclosed {oops} marker ",
                    ],
                  ],
                },
              ],
            ],
          ],
        },
      ],
    },
  ],
  null,
  "edge"
);

check(
  "edge: curly quotes + unknown pipe tag keeps word + unclosed marker dropped",
  edge.entry!.definitions[0].definition,
  'curly quotes “hello” and an unknown flimflam tag and an unclosed marker'
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
