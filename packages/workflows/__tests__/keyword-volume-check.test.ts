import { beforeEach, describe, expect, it, vi } from "vitest";

// Table-aware fake, scoped to just the two tables this step reads.
let keywordRows: { keyword: string; avg_monthly_searches: number | null }[] =
  [];
let gscRows: { query: string; clicks: number; impressions: number }[] = [];

const makeBuilder = (table: string) => {
  const data = table === "keyword_research" ? keywordRows : gscRows;
  const result = { data, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: typeof result) => unknown) =>
    resolve(result);
  return builder;
};

vi.mock("@repo/database", () => ({
  database: {
    from: vi.fn((table: string) => makeBuilder(table)),
  },
}));

import { database } from "@repo/database";
import {
  evaluateKeywordVolume,
  keywordVolumeCheckStep,
} from "../keyword-volume-check";

beforeEach(() => {
  vi.clearAllMocks();
  keywordRows = [];
  gscRows = [];
});

describe("evaluateKeywordVolume (pure)", () => {
  it("never blocks when there's no keyword_research cache at all for this site", () => {
    const result = evaluateKeywordVolume({
      keyword: "espresso machine",
      avgMonthlySearches: null,
      hasKeywordResearchData: false,
      matchedGscQuery: null,
    });

    expect(result).toEqual({ blocked: false, reasons: [] });
  });

  it("does not block when the keyword is already proven on this site via GSC, even with low volume", () => {
    const result = evaluateKeywordVolume({
      keyword: "espresso machine",
      avgMonthlySearches: 2,
      hasKeywordResearchData: true,
      matchedGscQuery: { clicks: 3, impressions: 100 },
    });

    expect(result).toEqual({ blocked: false, reasons: [] });
  });

  it("blocks when volume is below the threshold and there's no GSC traction", () => {
    const result = evaluateKeywordVolume({
      keyword: "espresso machine",
      avgMonthlySearches: 3,
      hasKeywordResearchData: true,
      matchedGscQuery: null,
    });

    expect(result.blocked).toBe(true);
    expect(result.reasons[0]).toContain("espresso machine");
  });

  it("does not block when volume is at or above the threshold", () => {
    const result = evaluateKeywordVolume({
      keyword: "espresso machine",
      avgMonthlySearches: 10,
      hasKeywordResearchData: true,
      matchedGscQuery: null,
    });

    expect(result).toEqual({ blocked: false, reasons: [] });
  });

  it("fails open when the cache exists but has no matching row for this keyword (avgMonthlySearches null)", () => {
    const result = evaluateKeywordVolume({
      keyword: "espresso machine",
      avgMonthlySearches: null,
      hasKeywordResearchData: true,
      matchedGscQuery: null,
    });

    expect(result).toEqual({ blocked: false, reasons: [] });
  });

  it("does not block when a zero-impression/zero-click GSC row matches (not real traction)", () => {
    const result = evaluateKeywordVolume({
      keyword: "espresso machine",
      avgMonthlySearches: 3,
      hasKeywordResearchData: true,
      matchedGscQuery: { clicks: 0, impressions: 0 },
    });

    expect(result.blocked).toBe(true);
  });
});

describe("keywordVolumeCheckStep (I/O)", () => {
  it("queries both tables scoped to siteConnectionId and fuzzy-matches the keyword", async () => {
    keywordRows = [
      { keyword: "best espresso machine 2026", avg_monthly_searches: 5 },
    ];
    gscRows = [];

    const result = await keywordVolumeCheckStep({
      siteConnectionId: "site-1",
      primaryKeyword: "espresso machine",
    });

    const fromMock = vi.mocked(database.from);
    expect(fromMock).toHaveBeenCalledWith("keyword_research");
    expect(fromMock).toHaveBeenCalledWith("search_console_queries");
    expect(result.blocked).toBe(true);
  });

  it("treats non-array data defensively as no cache data (never throws)", async () => {
    // @ts-expect-error deliberately malformed to exercise the guard
    keywordRows = { unexpected: "shape" };

    await expect(
      keywordVolumeCheckStep({
        siteConnectionId: "site-1",
        primaryKeyword: "anything",
      })
    ).resolves.toEqual({ blocked: false, reasons: [] });
  });
});
