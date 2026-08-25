import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wordpressAdapter } from "../wordpress-adapter";

const baseConfig = {
  siteConnectionId: "s1",
  organizationSlug: "acme",
  baseUrl: "https://blog.example.com/",
  credentials: { username: "editor", applicationPassword: "abcd 1234 efgh" },
};

describe("wordpressAdapter.testConnection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends HTTP Basic auth built from username:applicationPassword", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await wordpressAdapter.testConnection(baseConfig);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://blog.example.com/wp-json/wp/v2/users/me",
      {
        headers: {
          Authorization: `Basic ${Buffer.from("editor:abcd 1234 efgh").toString("base64")}`,
        },
      }
    );
  });

  it("strips a trailing slash from baseUrl before joining the wp-json path", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await wordpressAdapter.testConnection(baseConfig);

    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("//wp-json");
  });

  it("returns ok:false with the status on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const result = await wordpressAdapter.testConnection(baseConfig);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
  });

  it("returns ok:false without credentials rather than throwing", async () => {
    const result = await wordpressAdapter.testConnection({
      ...baseConfig,
      credentials: null,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("wordpressAdapter.publishPost", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs title/content/slug/status and maps id/link to the result", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 42, link: "https://blog.example.com/hello" }), {
        status: 201,
      })
    );

    const result = await wordpressAdapter.publishPost(baseConfig, {
      title: "Hello",
      slug: "hello",
      contentHtml: "<p>Hi</p>",
    });

    expect(result).toEqual({
      externalPostId: "42",
      publishedUrl: "https://blog.example.com/hello",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://blog.example.com/wp-json/wp/v2/posts");
    expect(JSON.parse(init.body)).toEqual({
      title: "Hello",
      content: "<p>Hi</p>",
      slug: "hello",
      status: "publish",
    });
  });

  it("throws with the WordPress error message on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Sorry, you are not allowed to create posts." }), {
        status: 403,
      })
    );

    await expect(
      wordpressAdapter.publishPost(baseConfig, {
        title: "Hello",
        slug: "hello",
        contentHtml: "<p>Hi</p>",
      })
    ).rejects.toThrow("Sorry, you are not allowed to create posts.");
  });

  it("throws without credentials rather than making a network call", async () => {
    await expect(
      wordpressAdapter.publishPost(
        { ...baseConfig, credentials: null },
        { title: "Hello", slug: "hello", contentHtml: "<p>Hi</p>" }
      )
    ).rejects.toThrow(/username\/application password/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
