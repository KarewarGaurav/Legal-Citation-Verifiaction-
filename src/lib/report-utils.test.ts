import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeReportCitations,
  dedupeSectionAlerts,
  sectionAlertKey,
} from "@/lib/report-utils";
import type {
  SectionNormalizationAlert,
  VerificationResult,
} from "@/lib/types";

describe("dedupeSectionAlerts", () => {
  it("keeps one alert per unique mapping", () => {
    const alerts: SectionNormalizationAlert[] = [
      {
        original: "Section 420 IPC",
        normalized: "Section 318 BNS",
        severity: "INFO",
        oldAct: "IPC",
        oldSection: "420",
        newAct: "BNS",
        newSection: "318",
      },
      {
        original: "s. 420 IPC",
        normalized: "s. 318 BNS",
        severity: "INFO",
        oldAct: "IPC",
        oldSection: "420",
        newAct: "BNS",
        newSection: "318",
      },
    ];
    assert.equal(dedupeSectionAlerts(alerts).length, 1);
    assert.equal(sectionAlertKey(alerts[0]), "IPC:420→BNS:318");
  });
});

describe("dedupeReportCitations", () => {
  it("aggregates occurrence counts by citation text", () => {
    const results: VerificationResult[] = [
      {
        citationId: "a",
        citationText: "AIR 2004 SC 3358",
        status: "verified",
        confidence: 0.9,
        checkedAt: new Date().toISOString(),
      },
      {
        citationId: "b",
        citationText: "AIR 2004 SC 3358",
        status: "verified",
        confidence: 0.85,
        checkedAt: new Date().toISOString(),
      },
      {
        citationId: "c",
        citationText: "AIR 2004 SC 3358",
        status: "verified",
        confidence: 0.8,
        checkedAt: new Date().toISOString(),
      },
    ];
    const unique = dedupeReportCitations(results);
    assert.equal(unique.length, 1);
    assert.equal(unique[0].citationText, "AIR 2004 SC 3358");
    assert.equal(unique[0].occurrenceCount, 3);
  });
});
