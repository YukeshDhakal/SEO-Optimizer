import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listSites, queryTopQueries } from "../search-analytics";

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
          siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }],
        }),
        { status: 200 }
      )
    );

    const sites = await listSites("access-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites");
    expect(init.headers.Authorization).toBe("Bearer access-1");
    expect(sites).toEqual([{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }]);
  });

  it("returns an empty array when the account has no verified properties", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

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
          rows: [{ keys: ["best coffee grinder"], clicks: 42, impressions: 900, ctr: 0.0467, position: 4.2 }],
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
      { query: "best coffee grinder", clicks: 42, impressions: 900, ctr: 0.0467, position: 4.2 },
    ]);
  });

  it("returns an empty array when there are no rows", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    const rows = await queryTopQueries("access-1", "https://example.com/", {
      startDate: "2026-07-01",
      endDate: "2026-07-28",
      rowLimit: 250,
    });

    expect(rows).toEqual([]);
  });
});
