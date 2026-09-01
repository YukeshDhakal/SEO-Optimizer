import { describe, expect, it } from "vitest";
import { stripAiDashes } from "../text-sanitize";

describe("stripAiDashes", () => {
  it("replaces an em dash clause break with a comma", () => {
    expect(stripAiDashes("This is fast—and reliable.")).toBe(
      "This is fast, and reliable."
    );
  });

  it("replaces an en dash clause break with a comma", () => {
    expect(stripAiDashes("Open Monday–Friday for support.")).toBe(
      "Open Monday, Friday for support."
    );
  });

  it("replaces a spaced em dash with a comma, not a double comma", () => {
    expect(stripAiDashes("Great coverage — at a fair price.")).toBe(
      "Great coverage, at a fair price."
    );
  });

  it("leaves ordinary hyphens in compound words untouched", () => {
    expect(stripAiDashes("A well-labeled, GEO/AEO-ready section.")).toBe(
      "A well-labeled, GEO/AEO-ready section."
    );
  });

  it("leaves a markdown horizontal rule (---) untouched", () => {
    expect(stripAiDashes("above\n\n---\n\nbelow")).toBe("above\n\n---\n\nbelow");
  });

  it("collapses a dash that already sits next to a comma instead of doubling it", () => {
    expect(stripAiDashes("Fast, reliable—and affordable.")).toBe(
      "Fast, reliable, and affordable."
    );
  });

  it("is a no-op on text with no dashes", () => {
    expect(stripAiDashes("Plain sentence, no dashes here.")).toBe(
      "Plain sentence, no dashes here."
    );
  });
});
