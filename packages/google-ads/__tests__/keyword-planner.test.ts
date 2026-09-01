import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token-1";
process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "1112223333";

const { generateKeywordHistoricalMetrics, listAccessibleCustomers } =
  await import("../keyword-planner");

describe("listAccessibleCustomers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends developer-token/login-customer-id headers and strips the customers/ prefix", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ resourceNames: ["customers/1234567890"] }),
        { status: 200 }
      )
    );

    const customers = await listAccessibleCustomers("access-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://googleads.googleapis.com/v17/customers:listAccessibleCustomers"
    );
    expect(init.headers.Authorization).toBe("Bearer access-1");
    expect(init.headers["developer-token"]).toBe("dev-token-1");
    expect(init.headers["login-customer-id"]).toBe("1112223333");
    expect(customers).toEqual([{ customerId: "1234567890" }]);
  });

  it("returns an empty array when there are no accessible customers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    expect(await listAccessibleCustomers("access-1")).toEqual([]);
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));

    await expect(listAccessibleCustomers("bad-token")).rejects.toThrow(
      /HTTP 401/
    );
  });

  // Regression test: this used to throw only "HTTP 401" with no further
  // detail, which is why an unset/invalid developer-token header and a
  // genuine "zero accessible accounts" response were indistinguishable in
  // the callback route and, from there, in the site page's UI.
  it("includes Google's own error message and status in the thrown error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 401,
            message: "Request had invalid authentication credentials.",
            status: "UNAUTHENTICATED",
          },
        }),
        { status: 401 }
      )
    );

    await expect(listAccessibleCustomers("bad-token")).rejects.toThrow(
      /HTTP 401.*\[UNAUTHENTICATED\].*invalid authentication credentials/
    );
  });

  it("falls back to just the HTTP status when the error body isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>502 Bad Gateway</html>", { status: 502 })
    );

    await expect(listAccessibleCustomers("bad-token")).rejects.toThrow(
      "Google Ads API error (HTTP 502)."
    );
  });
});

describe("generateKeywordHistoricalMetrics", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts keywords with default geo/language and maps keywordMetrics", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              text: "best coffee grinder",
              keywordMetrics: {
                avgMonthlySearches: "8100",
                competition: "MEDIUM",
                competitionIndex: "42",
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const metrics = await generateKeywordHistoricalMetrics("access-1", {
      customerId: "1234567890",
      keywords: ["best coffee grinder"],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://googleads.googleapis.com/v17/customers/1234567890:generateKeywordHistoricalMetrics"
    );
    const body = JSON.parse(init.body as string);
    expect(body.keywords).toEqual(["best coffee grinder"]);
    expect(body.geoTargetConstants).toEqual(["geoTargetConstants/2840"]);
    expect(body.language).toBe("languageConstants/1000");

    expect(metrics).toEqual([
      {
        keyword: "best coffee grinder",
        avgMonthlySearches: 8100,
        competition: "MEDIUM",
        competitionIndex: 42,
      },
    ]);
  });

  it("maps missing keywordMetrics to nulls rather than throwing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [{ text: "obscure phrase" }] }), {
        status: 200,
      })
    );

    const metrics = await generateKeywordHistoricalMetrics("access-1", {
      customerId: "1234567890",
      keywords: ["obscure phrase"],
    });

    expect(metrics).toEqual([
      {
        keyword: "obscure phrase",
        avgMonthlySearches: null,
        competition: null,
        competitionIndex: null,
      },
    ]);
  });

  it("returns an empty array when there are no results", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    const metrics = await generateKeywordHistoricalMetrics("access-1", {
      customerId: "1234567890",
      keywords: ["anything"],
    });

    expect(metrics).toEqual([]);
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));

    await expect(
      generateKeywordHistoricalMetrics("access-1", {
        customerId: "1234567890",
        keywords: ["x"],
      })
    ).rejects.toThrow(/HTTP 403/);
  });
});
