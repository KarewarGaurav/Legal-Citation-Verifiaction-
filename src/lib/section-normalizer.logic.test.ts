import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractLegalSections } from "./section-normalizer";

describe("extractLegalSections", () => {
  it("finds IPC sections in complaint text", () => {
    const text =
      "Complaint under Section 420 IPC and Section 406 IPC read with Section 120B IPC.";
    const found = extractLegalSections(text);
    const numbers = found.map((s) => s.sectionNumber);
    assert.ok(numbers.includes("420"));
    assert.ok(numbers.includes("406"));
    assert.ok(numbers.includes("120B"));
  });

  it("finds CrPC section with subsection", () => {
    const text = "Petition under Section 156(3) CrPC for investigation.";
    const found = extractLegalSections(text);
    assert.ok(found.some((s) => s.sectionNumber === "156(3)" && s.act === "CrPC"));
  });

  it("finds IEA electronic evidence section", () => {
    const text = "Admissibility under Section 65B IEA for electronic records.";
    const found = extractLegalSections(text);
    assert.ok(found.some((s) => s.sectionNumber === "65B" && s.act === "IEA"));
  });
});
