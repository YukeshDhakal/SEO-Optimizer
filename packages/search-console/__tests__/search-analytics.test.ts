import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectUrl, listSites, queryTopQueries } from "../search-analytics";

describe("listSites", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a bearer token and maps siteEntry rows", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          siteEntry: [
            { siteUrl: "https://example.com/", permissionLevel: "siteOwner" },
          ],
        }),
        { status: 200 }
      )
    );

    const sites = await listSites("access-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites");
    expect(init.headers.Authorization).toBe("Bearer access-1");
    expect(sites).toEqual([
      { siteUrl: "https://example.com/", permissionLevel: "siteOwner" },
    ]);
  });

  it("returns an empty array when the account has no verified properties", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    expect(await listSites("access-1")).toEqual([]);
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));

    await expect(listSites("bad-token")).rejects.toThrow(/HTTP 401/);
  });
});

describe("queryTopQueries", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("URL-encodes the site URL and maps query rows", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          rows: [
            {
              keys: ["best coffee grinder"],
              clicks: 42,
              impressions: 900,
              ctr: 0.0467,
              position: 4.2,
            },
          ],
        }),
        { status: 200 }
      )
    );

    const rows = await queryTopQueries("access-1", "https://example.com/", {
      startDate: "2026-07-01",
      endDate: "2026-07-28",
      rowLimit: 250,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query"
    );
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-28",
      dimensions: ["query"],
      rowLimit: 250,
    });

    expect(rows).toEqual([
      {
        query: "best coffee grinder",
        clicks: 42,
        impressions: 900,
        ctr: 0.0467,
        position: 4.2,
      },
    ]);
  });

  it("returns an empty array when there are no rows", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    const rows = await queryTopQueries("access-1", "https://example.com/", {
      startDate: "2026-07-01",
      endDate: "2026-07-28",
      rowLimit: 250,
    });

    expect(rows).toEqual([]);
  });
});

describe("inspectUrl", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts both URLs in the body to the inspection host and maps the result", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          inspectionResult: {
            inspectionResultLink:
              "https://search.google.com/search-console/inspect?x=1",
            indexStatusResult: {
              verdict: "PASS",
              coverageState: "Submitted and indexed",
              robotsTxtState: "ALLOWED",
              indexingState: "INDEXING_ALLOWED",
              lastCrawlTime: "2026-08-30T04:11:00Z",
              pageFetchState: "SUCCESSFUL",
            },
          },
        }),
        { status: 200 }
      )
    );

    const result = await inspectUrl(
      "access-1",
      "https://example.com/",
      "https://example.com/best-coffee-grinder"
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer access-1");
    // Both URLs travel in the JSON body here — unlike queryTopQueries, there's
    // nothing path-encoded to assert.
    expect(JSON.parse(init.body as string)).toEqual({
      inspectionUrl: "https://example.com/best-coffee-grinder",
      siteUrl: "https://example.com/",
    });

    expect(result).toEqual({
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      indexingState: "INDEXING_ALLOWED",
      robotsTxtState: "ALLOWED",
      pageFetchState: "SUCCESSFUL",
      lastCrawlTime: "2026-08-30T04:11:00Z",
      inspectionResultLink:
        "https://search.google.com/search-console/inspect?x=1",
    });
  });

  it("surfaces a real non-PASS verdict rather than normalizing it away", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          inspectionResult: {
            indexStatusResult: {
              verdict: "FAIL",
              coverageState: "Excluded by 'noindex' tag",
            },
          },
        }),
        { status: 200 }
      )
    );

    const result = await inspectUrl(
      "access-1",
      "https://example.com/",
      "https://example.com/x"
    );

    expect(result.verdict).toBe("FAIL");
    expect(result.coverageState).toBe("Excluded by 'noindex' tag");
    // Every field Google omitted maps to null, not undefined — these go
    // straight into nullable url_inspections columns.
    expect(result.indexingState).toBeNull();
    expect(result.robotsTxtState).toBeNull();
    expect(result.pageFetchState).toBeNull();
    expect(result.lastCrawlTime).toBeNull();
    expect(result.inspectionResultLink).toBeNull();
  });

  it("falls back to VERDICT_UNSPECIFIED when the response carries no inspection result", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    const result = await inspectUrl(
      "access-1",
      "https://example.com/",
      "https://example.com/x"
    );

    expect(result.verdict).toBe("VERDICT_UNSPECIFIED");
    expect(result.coverageState).toBeNull();
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));

    await expect(
      inspectUrl("bad-token", "https://example.com/", "https://example.com/x")
    ).rejects.toThrow(/HTTP 403/);
  });
});
