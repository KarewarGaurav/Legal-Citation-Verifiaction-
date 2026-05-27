import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectHallucinations,
  RULE_FUTURE_YEAR,
  RULE_IMPOSSIBLE_VOLUME,
  RULE_PRE_MODERN,
  RULE_SUSPICIOUS_PAGE,
} from "./hallucination-detector";

describe("detectHallucinations", () => {
  it("flags future year as hallucinated", () => {
    const r = detectHallucinations("(2028) 3 SCC 45");
    assert.equal(r.isHallucinated, true);
    assert.ok(r.triggeredRules.includes(RULE_FUTURE_YEAR));
  });

  it("flags impossible SCC volume", () => {
    const r = detectHallucinations("(2024) 47 SCC 123");
    assert.equal(r.isHallucinated, true);
    assert.ok(r.triggeredRules.includes(RULE_IMPOSSIBLE_VOLUME));
  });

  it("flags suspicious page without hallucinated", () => {
    const r = detectHallucinations("(2024) 5 SCC 9999");
    assert.equal(r.isHallucinated, false);
    assert.equal(r.isSuspicious, true);
    assert.ok(r.triggeredRules.includes(RULE_SUSPICIOUS_PAGE));
  });

  it("flags pre-modern year as suspicious", () => {
    const r = detectHallucinations("(1856) 3 SCC 45");
    assert.equal(r.isSuspicious, true);
    assert.ok(r.triggeredRules.includes(RULE_PRE_MODERN));
  });

  it("passes plausible SCC cite", () => {
    const r = detectHallucinations("(2021) 10 SCC 1");
    assert.equal(r.isHallucinated, false);
    assert.equal(r.isSuspicious, false);
    assert.equal(r.triggeredRules.length, 0);
  });
});
