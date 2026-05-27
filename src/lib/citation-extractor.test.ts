import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCitationMatchableText,
  normalizeCitationSpacing,
  preparePostgresRegexForJs,
} from "./citation-extractor";

/** SCC pattern from supabase/seed.sql */
const SCC_PATTERN =
  "(?:\\(\\s*(\\d{4})\\s*\\)|(\\d{4}))\\s*(\\d+)\\s*SCC\\s*(\\d+)";
const SCC_ONLINE_PATTERN =
  "(\\d{4})\\s+SCC\\s+OnLine\\s+(SC|Del|Bom|All|Mad|Ker|Cal|[A-Za-z]+)\\s+(\\d+)";
const AIR_PATTERN =
  "AIR\\s+(\\d{4})\\s+(SC|All|Bom|Cal|Del|Mad|Ker|Kant|Pat|Guj|Raj|MP|HP|Ori|AP|Punj|J&K|[A-Za-z&]+)\\s+(\\d+)";

function compileSeedPattern(source: string): RegExp {
  const { cleanedRegex, flags } = preparePostgresRegexForJs(`(?i)${source}`);
  return new RegExp(cleanedRegex, flags);
}

function firstMatch(pattern: RegExp, text: string): string | null {
  pattern.lastIndex = 0;
  const m = pattern.exec(text);
  return m?.[0] ?? null;
}

describe("normalizeCitationSpacing", () => {
  const cases: { input: string; expected: string }[] = [
    { input: "(2004)6 SCC224", expected: "(2004) 6 SCC 224" },
    { input: "(2023)5 SCC123", expected: "(2023) 5 SCC 123" },
    { input: "AIR2024SC567", expected: "AIR 2024 SC 567" },
    { input: "2024SCCOnLineDel3456", expected: "2024 SCC OnLine Del 3456" },
    { input: "(2004)  6   SCC   224", expected: "(2004) 6 SCC 224" },
    { input: "2024SCC OnLine Del3456", expected: "2024 SCC OnLine Del 3456" },
    { input: "AIR  2024  SC  567", expected: "AIR 2024 SC 567" },
  ];

  for (const { input, expected } of cases) {
    it(`normalizes "${input}"`, () => {
      assert.equal(normalizeCitationSpacing(input), expected);
    });
  }
});

describe("buildCitationMatchableText + DB SCC patterns", () => {
  const sccRe = compileSeedPattern(SCC_PATTERN);
  const sccOnlineRe = compileSeedPattern(SCC_ONLINE_PATTERN);
  const airRe = compileSeedPattern(AIR_PATTERN);

  it("matches malformed SCC citations after pipeline", () => {
    const malformed = ["(2004)6 SCC224", "(2023)5 SCC123"];
    for (const raw of malformed) {
      const { matchableText } = buildCitationMatchableText(raw);
      assert.equal(normalizeCitationSpacing(raw), matchableText);
      const hit = firstMatch(sccRe, matchableText);
      assert.ok(hit, `expected SCC match in "${matchableText}" from "${raw}"`);
      assert.equal(hit, normalizeCitationSpacing(raw));
    }
  });

  it("matches glued AIR and SCC OnLine after pipeline", () => {
    const air = buildCitationMatchableText("AIR2024SC567");
    assert.equal(air.matchableText, "AIR 2024 SC 567");
    assert.ok(firstMatch(airRe, air.matchableText));

    const online = buildCitationMatchableText("2024SCCOnLineDel3456");
    assert.equal(online.matchableText, "2024 SCC OnLine Del 3456");
    assert.ok(firstMatch(sccOnlineRe, online.matchableText));
  });

  it("keeps index map length aligned with matchable text", () => {
    const doc = "See (2004)6 SCC224 and AIR2024SC567.";
    const { matchableText, indexSlice } = buildCitationMatchableText(doc);
    assert.equal(indexSlice.normalized, matchableText);
    assert.equal(indexSlice.toOriginal.length, matchableText.length);
    assert.ok(firstMatch(sccRe, matchableText));
    assert.ok(firstMatch(airRe, matchableText));
  });
});
