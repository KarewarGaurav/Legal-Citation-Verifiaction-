import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  __setSectionMappingsForTests,
  extractLegalSections,
  normalizeSections,
  remapIndexAfterReplacements,
} from "./section-normalizer";
import type { SectionMappingRecord } from "@/lib/types";

const TEST_MAPPINGS: SectionMappingRecord[] = [
  {
    id: "t1",
    old_section: "302",
    new_section: "101",
    old_act: "IPC",
    new_act: "BNS",
  },
  {
    id: "t2",
    old_section: "420",
    new_section: "318",
    old_act: "IPC",
    new_act: "BNS",
  },
  {
    id: "t3",
    old_section: "406",
    new_section: "316",
    old_act: "IPC",
    new_act: "BNS",
  },
  {
    id: "t4",
    old_section: "438",
    new_section: "482",
    old_act: "CrPC",
    new_act: "BNSS",
  },
];

afterEach(() => {
  __setSectionMappingsForTests(null);
});

describe("normalizeSections with in-memory mappings", () => {
  it("normalizes mapped IPC spans and leaves current BNS references unchanged (mixed IPC/BNS)", async () => {
    const text =
      "Murder under Section 302 IPC is compared with Section 103 BNS in the same paragraph.";
    const result = await normalizeSections(text, {
      mode: "normalize_to_current_codes",
      mappings: TEST_MAPPINGS,
    });

    assert.equal(result.normalizedText.includes("Section 101 BNS"), true);
    assert.equal(result.normalizedText.includes("Section 302 IPC"), false);
    assert.equal(result.normalizedText.includes("Section 103 BNS"), true);
  });

  it("keeps unmapped legacy sections verbatim", async () => {
    const text = "Punishment under Section 300 IPC has no mapping row.";
    const result = await normalizeSections(text, {
      mode: "normalize_to_current_codes",
      mappings: TEST_MAPPINGS,
    });

    assert.equal(result.normalizedText, text);
    assert.ok(
      result.alerts.some(
        (a) => a.severity === "WARNING" && a.original.includes("300 IPC")
      )
    );
  });

  it("normalizes every repeated occurrence of the same section", async () => {
    const text =
      "First Section 420 IPC and later Section 420 IPC must both update.";
    const result = await normalizeSections(text, {
      mode: "normalize_to_current_codes",
      mappings: TEST_MAPPINGS,
    });

    assert.equal(
      (result.normalizedText.match(/Section 318 BNS/g) ?? []).length,
      2
    );
    assert.equal(result.normalizedText.includes("420 IPC"), false);
  });

  it("does not partially normalize compound phrases when one section lacks a mapping", async () => {
    const partialMappings: SectionMappingRecord[] = [TEST_MAPPINGS[1]!];
    const text = "Charges under Sections 420 and 406 IPC were framed.";
    const result = await normalizeSections(text, {
      mode: "normalize_to_current_codes",
      mappings: partialMappings,
    });

    assert.equal(result.normalizedText, text);
    assert.equal(result.replacements.length, 0);
  });

  it("normalizes compound phrases when every legacy section in the group maps", async () => {
    const text = "Charges under Sections 420 and 406 IPC were framed.";
    const result = await normalizeSections(text, {
      mode: "normalize_to_current_codes",
      mappings: TEST_MAPPINGS,
    });

    assert.equal(
      result.normalizedText,
      "Charges under Sections 318 and 316 BNS were framed."
    );
    const mappedSections = new Set(result.replacements.map((r) => r.oldSection));
    assert.ok(mappedSections.has("420"));
    assert.ok(mappedSections.has("406"));
  });

  it("preserve_original mode leaves text and alerts empty", async () => {
    const text = "Section 420 IPC";
    const result = await normalizeSections(text, {
      mode: "preserve_original",
      mappings: TEST_MAPPINGS,
    });

    assert.equal(result.normalizedText, text);
    assert.equal(result.replacements.length, 0);
    assert.equal(result.alerts.length, 0);
  });
});

describe("extractLegalSections overlapping spans", () => {
  it("dedupes overlapping single vs compound detections on the same phrase", () => {
    const text = "Sections 420 and 406 IPC apply.";
    const found = extractLegalSections(text);
    const compound = found.filter((s) => s.groupId);
    assert.equal(compound.length, 2);
    const singlesOnPhrase = found.filter(
      (s) => !s.groupId && s.fullMatch.includes("420")
    );
    assert.equal(singlesOnPhrase.length, 0);
  });
});

describe("remapIndexAfterReplacements", () => {
  it("shifts indices after replacements for downstream offset alignment", async () => {
    const text = "Before Section 420 IPC after.";
    const result = await normalizeSections(text, {
      mode: "normalize_to_current_codes",
      mappings: TEST_MAPPINGS,
    });
    const ipcStart = text.indexOf("Section 420 IPC");
    const remapped = remapIndexAfterReplacements(ipcStart, result.replacements);
    const slice = result.normalizedText.slice(
      remapped,
      remapped + "Section 318 BNS".length
    );
    assert.equal(slice, "Section 318 BNS");
  });
});
