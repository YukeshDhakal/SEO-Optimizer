import { describe, expect, it, vi } from "vitest";

// sanitizeOutline is a pure function, but it lives in the same module as
// outline(), which imports `../model` (guarded by `server-only`) and
// `generateObject` from "ai" - mock both so importing for the one pure
// function doesn't drag in that guard, matching geo-seo-optimize.test.ts's
// pattern for buildSchemaJsonLd.
vi.mock("../model", () => ({ getModel: vi.fn() }));
vi.mock("ai", () => ({ generateObject: vi.fn() }));

import { sanitizeOutline } from "../steps/outline";
import type { Outline } from "../schemas";

const faq = (n: number): Outline["faqSection"] =>
  Array.from({ length: n }, (_, i) => ({
    question: `Question ${i + 1}?`,
    answer: `Answer ${i + 1}.`,
  }));

const outlineWith = (faqCount: number): Outline => ({
  leadAnswer: "A direct answer.",
  sections: [{ heading: "Section 1", bullets: ["a"] }],
  faqSection: faq(faqCount),
});

// Regression coverage for the fix: schemas.ts's outlineSchema only enforces
// a minimum of 1 FAQ entry, so without this truncation a "blog" outline
// that comes back with more questions than content-guidelines.ts's
// FAQ_COUNT_BOUNDS.blog.max reads like an FAQ dump grafted onto an article.
describe("sanitizeOutline", () => {
  it("truncates a blog outline's faqSection down to the blog max (4)", () => {
    const result = sanitizeOutline(outlineWith(7), "blog");
    expect(result.faqSection).toHaveLength(4);
    expect(result.faqSection[0].question).toBe("Question 1?");
  });

  it("leaves a blog outline's faqSection untouched when already within bounds", () => {
    const result = sanitizeOutline(outlineWith(3), "blog");
    expect(result.faqSection).toHaveLength(3);
  });

  it("allows more FAQ entries for the faq content type (up to 8)", () => {
    const result = sanitizeOutline(outlineWith(10), "faq");
    expect(result.faqSection).toHaveLength(8);
  });

  it("never drops below the schema's own minimum of 1", () => {
    const result = sanitizeOutline(outlineWith(1), "blog");
    expect(result.faqSection).toHaveLength(1);
  });
});
