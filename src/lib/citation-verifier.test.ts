import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  aggregateVerificationMetrics,
  CITATION_VERIFICATION_SAMPLE_CITATIONS,
  clearMemoryVerificationCacheForTests,
  uniqueCitationKeysInOrder,
  verifyCitation,
  verifyCitationBatch,
} from "./citation-verifier";

describe("uniqueCitationKeysInOrder", () => {
  it("preserves first-seen order and drops duplicates", () => {
    const keys = uniqueCitationKeysInOrder([
      "AIR 2004 SC 3358",
      "  AIR   2004 SC 3358  ",
      "(2028) 3 SCC 45",
      "AIR 2004 SC 3358",
    ]);

    assert.deepEqual(keys, ["AIR 2004 SC 3358", "(2028) 3 SCC 45"]);
  });
});

describe("aggregateVerificationMetrics", () => {
  it("counts pre-filter, cache, and IK usage from metadata", () => {
    const metrics = aggregateVerificationMetrics([
      {
        citationText: "a",
        status: "REMOVED",
        source: "HALLUCINATION_RULE",
        verifiedAt: "2020-01-01T00:00:00.000Z",
        confidence: 1,
        metadata: { preFilterRemoved: true },
      },
      {
        citationText: "b",
        status: "VERIFIED",
        source: "CACHE",
        verifiedAt: "2020-01-01T00:00:00.000Z",
        confidence: 1,
        metadata: { fromCache: true, ikApiCalled: false },
      },
      {
        citationText: "c",
        status: "VERIFIED",
        source: "INDIAN_KANOON",
        verifiedAt: "2020-01-01T00:00:00.000Z",
        confidence: 1,
        metadata: { ikApiCalled: true },
      },
    ]);

    assert.equal(metrics.preFilterRemovedCount, 1);
    assert.equal(metrics.cacheHits, 1);
    assert.equal(metrics.ikApiCalls, 1);
  });
});

describe("verifyCitationBatch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearMemoryVerificationCacheForTests();
    delete process.env.INDIAN_KANOON_API_KEY;
  });

  it("deduplicates identical citations and issues one IK request", async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(
        JSON.stringify({
          found: 1,
          docs: [
            {
              tid: 123,
              title: "Sample Case",
              citeList: ["AIR 2004 SC 3358"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    process.env.INDIAN_KANOON_API_KEY = "test-token";

    const cite = CITATION_VERIFICATION_SAMPLE_CITATIONS.valid;
    const results = await verifyCitationBatch([cite, cite, cite]);

    assert.equal(results.length, 3);
    assert.equal(results[0].status, "VERIFIED");
    assert.equal(results[1].status, results[0].status);
    assert.equal(results[2].status, results[0].status);
    assert.equal(fetchCount, 1);
  });

  it("skips IK for hallucinated citations", async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ found: 0 }), { status: 200 });
    };

    process.env.INDIAN_KANOON_API_KEY = "test-token";

    const result = await verifyCitation(
      CITATION_VERIFICATION_SAMPLE_CITATIONS.hallucinated
    );

    assert.equal(result.status, "REMOVED");
    assert.equal(result.source, "HALLUCINATION_RULE");
    assert.equal(fetchCount, 0);
  });

  it("serves repeat lookups from memory cache without a second IK call", async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(
        JSON.stringify({
          found: 1,
          docs: [{ tid: 1, title: "Case", citeList: ["AIR 2004 SC 3358"] }],
        }),
        { status: 200 }
      );
    };

    process.env.INDIAN_KANOON_API_KEY = "test-token";

    const cite = CITATION_VERIFICATION_SAMPLE_CITATIONS.valid;
    await verifyCitation(cite);
    await verifyCitation(cite);

    assert.equal(fetchCount, 1);
  });
});
