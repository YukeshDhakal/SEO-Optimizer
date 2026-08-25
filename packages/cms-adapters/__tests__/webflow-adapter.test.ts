import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webflowAdapter } from "../webflow-adapter";

const baseConfig = {
  siteConnectionId: "s1",
  organizationSlug: "acme",
  baseUrl: "https://acme.webflow.io",
  credentials: {
    apiToken: "wf_token_abc",
    collectionId: "col123",
    fieldBody: "post-body",
    fieldMetaTitle: "meta-title",
    fieldMetaDescription: "",
  },
};

const collectionResponse = {
  id: "col123",
  slug: "blog-posts",
  fields: [
    { slug: "name", displayName: "Name", type: "PlainText" },
    { slug: "slug", displayName: "Slug", type: "PlainText" },
    { slug: "post-body", displayName: "Post Body", type: "RichText" },
    { slug: "meta-title", displayName: "Meta Title", type: "PlainText" },
  ],
};

describe("webflowAdapter.testConnection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a Bearer token and confirms the configured field slugs exist", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(collectionResponse), { status: 200 })
    );

    const result = await webflowAdapter.testConnection(baseConfig);

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.webflow.com/v2/collections/col123");
    expect(init.headers.Authorization).toBe("Bearer wf_token_abc");
  });

  it("returns ok:false when the configured body field no longer exists on the collection", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...collectionResponse,
          fields: collectionResponse.fields.filter(
            (field) => field.slug !== "post-body"
          ),
        }),
        { status: 200 }
      )
    );

    const result = await webflowAdapter.testConnection(baseConfig);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("post-body");
  });

  it("ignores an unmapped (empty-string) optional meta field", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(collectionResponse), { status: 200 })
    );

    // fieldMetaDescription is "" in baseConfig - should never be checked
    // against the field list, since empty string means "not mapped".
    const result = await webflowAdapter.testConnection(baseConfig);

    expect(result.ok).toBe(true);
  });

  it("returns ok:false without credentials rather than throwing", async () => {
    const result = await webflowAdapter.testConnection({
      ...baseConfig,
      credentials: null,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("webflowAdapter.publishPost", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /items/live with isDraft:false and maps fields via the configured slugs", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "item42",
            fieldData: { slug: "hello-world" },
          }),
          { status: 202 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(collectionResponse), { status: 200 })
      );

    const result = await webflowAdapter.publishPost(baseConfig, {
      title: "Hello World",
      slug: "hello-world",
      contentHtml: "<p>Hi</p>",
      metaTitle: "Hello, World! | Acme",
    });

    expect(result).toEqual({
      externalPostId: "item42",
      publishedUrl: "https://acme.webflow.io/blog-posts/hello-world",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.webflow.com/v2/collections/col123/items/live"
    );
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      fieldData: {
        name: "Hello World",
        slug: "hello-world",
        "post-body": "<p>Hi</p>",
        "meta-title": "Hello, World! | Acme",
      },
      isDraft: false,
      isArchived: false,
    });
  });

  it("throws with the Webflow error message on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Validation Error" }), {
        status: 400,
      })
    );

    await expect(
      webflowAdapter.publishPost(baseConfig, {
        title: "Hello",
        slug: "hello",
        contentHtml: "<p>Hi</p>",
      })
    ).rejects.toThrow("Validation Error");
  });

  it("throws without credentials rather than making a network call", async () => {
    await expect(
      webflowAdapter.publishPost(
        { ...baseConfig, credentials: null },
        { title: "Hello", slug: "hello", contentHtml: "<p>Hi</p>" }
      )
    ).rejects.toThrow(/API token, collection, or field mapping/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
