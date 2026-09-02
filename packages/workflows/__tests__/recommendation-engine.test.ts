import { afterEach, describe, expect, it, vi } from "vitest";
import {
  scoreIndexingProblem,
  scoreKeywordGap,
  scoreTitleMetaRewrite,
  scoreZeroTraction,
} from "../recommendation-engine";

// Fixed "now" for the age-based rules, so scoreZeroTraction's thresholds are
// asserted against a stable clock rather than the wall clock.
const NOW = new Date("2026-09-02T12:00:00Z");
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

afterEach(() => {
  vi.useRealTimers();
});

describe("scoreTitleMetaRewrite", () => {
  const base = { postId: "post-1", postTitle: "Best Coffee Grinders" };

  it("returns a candidate when a high-impression page ranks well but nobody clicks", () => {
    const result = scoreTitleMetaRewrite({
      ...base,
      matchedQuery: {
        query: "best coffee grinder",
        impressions: 900,
        ctr: 0.004,
        position: 4.2,
      },
    });

    expect(result).not.toBeNull();
    expect(result?.subjectKey).toBe("post-1");
    expect(result?.priority).toBe("medium");
    expect(result?.title).toContain("Best Coffee Grinders");
    expect(result?.metrics).toEqual({
      query: "best coffee grinder",
      impressions: 900,
      ctr: 0.004,
      position: 4.2,
    });
  });

  it("returns null when there's no GSC query associated with the post (fail open)", () => {
    expect(scoreTitleMetaRewrite({ ...base, matchedQuery: null })).toBeNull();
  });

  it("returns null below the impressions floor, where CTR is statistical noise", () => {
    expect(
      scoreTitleMetaRewrite({
        ...base,
        matchedQuery: { query: "q", impressions: 99, ctr: 0.0, position: 3 },
      })
    ).toBeNull();
  });

  it("returns null when CTR is at or above the threshold", () => {
    expect(
      scoreTitleMetaRewrite({
        ...base,
        matchedQuery: { query: "q", impressions: 500, ctr: 0.02, position: 3 },
      })
    ).toBeNull();
  });

  it("returns null when the page ranks too deep for the snippet to be the problem", () => {
    expect(
      scoreTitleMetaRewrite({
        ...base,
        matchedQuery: {
          query: "q",
          impressions: 500,
          ctr: 0.001,
          position: 21,
        },
      })
    ).toBeNull();
  });
});

describe("scoreKeywordGap", () => {
  it("returns a candidate for a real-volume keyword with no covering post", () => {
    const result = scoreKeywordGap({
      keyword: "Burr Grinder Reviews",
      avgMonthlySearches: 1200,
      hasMatchingPost: false,
    });

    expect(result).not.toBeNull();
    // Normalized keyword, not a post id — this type has no post to point at.
    expect(result?.subjectKey).toBe("burr grinder reviews");
    expect(result?.priority).toBe("medium");
    expect(result?.metrics.avgMonthlySearches).toBe(1200);
  });

  it("returns null when a post already covers the keyword", () => {
    expect(
      scoreKeywordGap({
        keyword: "burr grinder reviews",
        avgMonthlySearches: 1200,
        hasMatchingPost: true,
      })
    ).toBeNull();
  });

  it("returns null below the volume threshold", () => {
    expect(
      scoreKeywordGap({
        keyword: "burr grinder reviews",
        avgMonthlySearches: 49,
        hasMatchingPost: false,
      })
    ).toBeNull();
  });

  it("returns null when Keyword Planner gave no volume estimate (fail open)", () => {
    expect(
      scoreKeywordGap({
        keyword: "burr grinder reviews",
        avgMonthlySearches: null,
        hasMatchingPost: false,
      })
    ).toBeNull();
  });
});

describe("scoreIndexingProblem", () => {
  it("returns a high-priority candidate for a non-PASS verdict", () => {
    const result = scoreIndexingProblem({
      postId: "post-1",
      indexVerdict: "FAIL",
      coverageState: "Excluded by 'noindex' tag",
      lastCrawlTime: "2026-08-30T04:11:00Z",
    });

    expect(result).not.toBeNull();
    expect(result?.priority).toBe("high");
    expect(result?.subjectKey).toBe("post-1");
    expect(result?.description).toContain("noindex");
    expect(result?.metrics.indexVerdict).toBe("FAIL");
  });

  it("returns null for a PASS verdict", () => {
    expect(
      scoreIndexingProblem({
        postId: "post-1",
        indexVerdict: "PASS",
        coverageState: "Submitted and indexed",
        lastCrawlTime: null,
      })
    ).toBeNull();
  });

  it("returns null when the post has never been inspected (unknown, not a problem)", () => {
    expect(
      scoreIndexingProblem({
        postId: "post-1",
        indexVerdict: null,
        coverageState: null,
        lastCrawlTime: null,
      })
    ).toBeNull();
  });

  it("still flags a candidate when coverageState is missing", () => {
    const result = scoreIndexingProblem({
      postId: "post-1",
      indexVerdict: "NEUTRAL",
      coverageState: null,
      lastCrawlTime: null,
    });

    expect(result).not.toBeNull();
    expect(result?.priority).toBe("high");
  });
});

describe("scoreZeroTraction", () => {
  const base = { postId: "post-1", indexVerdict: "PASS" };

  it("returns a low-priority candidate for an old, indexed, impression-less post", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const result = scoreZeroTraction({
      ...base,
      publishedAt: daysAgo(30),
      matchedQuery: { impressions: 0 },
    });

    expect(result).not.toBeNull();
    expect(result?.priority).toBe("low");
    expect(result?.subjectKey).toBe("post-1");
    expect(result?.metrics.ageDays).toBe(30);
  });

  it("treats no matched GSC query at all as zero impressions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const result = scoreZeroTraction({
      ...base,
      publishedAt: daysAgo(20),
      matchedQuery: null,
    });

    expect(result).not.toBeNull();
    expect(result?.metrics.impressions).toBe(0);
  });

  it("returns null for a post younger than the ramp-up window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    expect(
      scoreZeroTraction({
        ...base,
        publishedAt: daysAgo(13),
        matchedQuery: { impressions: 0 },
      })
    ).toBeNull();
  });

  it("returns null when the post has impressions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    expect(
      scoreZeroTraction({
        ...base,
        publishedAt: daysAgo(30),
        matchedQuery: { impressions: 12 },
      })
    ).toBeNull();
  });

  it("defers to scoreIndexingProblem when the post isn't confirmed indexed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    expect(
      scoreZeroTraction({
        ...base,
        indexVerdict: "FAIL",
        publishedAt: daysAgo(30),
        matchedQuery: { impressions: 0 },
      })
    ).toBeNull();

    expect(
      scoreZeroTraction({
        ...base,
        indexVerdict: null,
        publishedAt: daysAgo(30),
        matchedQuery: { impressions: 0 },
      })
    ).toBeNull();
  });

  it("never throws on an unparseable published_at", () => {
    expect(() =>
      scoreZeroTraction({
        ...base,
        publishedAt: "not-a-date",
        matchedQuery: null,
      })
    ).not.toThrow();

    expect(
      scoreZeroTraction({
        ...base,
        publishedAt: "not-a-date",
        matchedQuery: null,
      })
    ).toBeNull();
  });
});
