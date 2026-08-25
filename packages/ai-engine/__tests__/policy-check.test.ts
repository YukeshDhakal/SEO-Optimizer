import { describe, expect, it } from "vitest";
import { runPolicyCheck } from "../policy-check";

describe("runPolicyCheck", () => {
  it("passes ordinary content", () => {
    const result = runPolicyCheck(
      "This article explains how to choose a good espresso machine for a small cafe."
    );
    expect(result).toEqual({ blocked: false, reasons: [] });
  });

  it("blocks a guaranteed-results claim", () => {
    const result = runPolicyCheck("Our method has guaranteed results every time.");
    expect(result.blocked).toBe(true);
  });

  it("blocks PII-shaped content (SSN pattern)", () => {
    const result = runPolicyCheck("Contact support with your SSN 123-45-6789.");
    expect(result.blocked).toBe(true);
  });

  it("blocks profanity", () => {
    const result = runPolicyCheck("This is such bullshit, wait no, this is fucking great.");
    expect(result.blocked).toBe(true);
  });

  it("collects multiple violations", () => {
    const result = runPolicyCheck(
      "This is guaranteed no risk, and also this is shit."
    );
    expect(result.reasons.length).toBeGreaterThan(1);
  });
});
