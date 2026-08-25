import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shopifyAdapter } from "../shopify-adapter";

const baseConfig = {
  siteConnectionId: "s1",
  organizationSlug: "acme",
  baseUrl: "https://acme-demo.myshopify.com",
  credentials: {
    accessToken: "shpat_abc123",
    blogId: "gid://shopify/Blog/1",
    blogHandle: "news",
  },
};

const graphqlUrl =
  "https://acme-demo.myshopify.com/admin/api/2026-07/graphql.json";

describe("shopifyAdapter.testConnection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends X-Shopify-Access-Token and checks the configured blog exists", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            blogs: {
              edges: [
                { node: { id: "gid://shopify/Blog/1", handle: "news", title: "News" } },
              ],
            },
          },
        }),
        { status: 200 }
      )
    );

    const result = await shopifyAdapter.testConnection(baseConfig);

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(graphqlUrl);
    expect(init.headers["X-Shopify-Access-Token"]).toBe("shpat_abc123");
  });

  it("returns ok:false when the configured blog isn't in the list", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            blogs: {
              edges: [
                {
                  node: {
                    id: "gid://shopify/Blog/999",
                    handle: "other",
                    title: "Other",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 }
      )
    );

    const result = await shopifyAdapter.testConnection(baseConfig);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no longer exists|can't see it/);
  });

  it("returns ok:false on a GraphQL errors[] response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errors: [{ message: "Invalid API key or access token" }] }),
        { status: 200 }
      )
    );

    const result = await shopifyAdapter.testConnection(baseConfig);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid API key or access token");
  });

  it("returns ok:false without credentials rather than throwing", async () => {
    const result = await shopifyAdapter.testConnection({
      ...baseConfig,
      credentials: null,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("shopifyAdapter.publishPost", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls articleCreate with isPublished:true and builds the storefront URL from blogHandle", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            articleCreate: {
              article: { id: "gid://shopify/Article/42", handle: "hello-world" },
              userErrors: [],
            },
          },
        }),
        { status: 200 }
      )
    );

    const result = await shopifyAdapter.publishPost(baseConfig, {
      title: "Hello World",
      slug: "hello-world",
      contentHtml: "<p>Hi</p>",
    });

    expect(result).toEqual({
      externalPostId: "gid://shopify/Article/42",
      publishedUrl: "https://acme-demo.myshopify.com/blogs/news/hello-world",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.variables.article).toEqual({
      blogId: "gid://shopify/Blog/1",
      title: "Hello World",
      body: "<p>Hi</p>",
      handle: "hello-world",
      isPublished: true,
    });
  });

  it("throws with the userErrors message on a rejected mutation", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            articleCreate: {
              article: null,
              userErrors: [{ field: ["handle"], message: "Handle already taken" }],
            },
          },
        }),
        { status: 200 }
      )
    );

    await expect(
      shopifyAdapter.publishPost(baseConfig, {
        title: "Hello",
        slug: "hello",
        contentHtml: "<p>Hi</p>",
      })
    ).rejects.toThrow("Handle already taken");
  });

  it("throws without credentials rather than making a network call", async () => {
    await expect(
      shopifyAdapter.publishPost(
        { ...baseConfig, credentials: null },
        { title: "Hello", slug: "hello", contentHtml: "<p>Hi</p>" }
      )
    ).rejects.toThrow(/access token\/blog selection/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
