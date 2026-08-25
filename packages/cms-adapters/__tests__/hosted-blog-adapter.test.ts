import { describe, expect, it } from "vitest";
import { hostedBlogAdapter, hostedBlogPostUrl } from "../hosted-blog-adapter";

describe("hostedBlogPostUrl", () => {
  it("builds a tenant-subdomain blog URL from the org slug and post slug", () => {
    expect(hostedBlogPostUrl("acme", "hello-world")).toBe(
      "https://acme.ourapp.com/blog/hello-world"
    );
  });
});

describe("hostedBlogAdapter", () => {
  it("always reports connected - no external dependency to test", async () => {
    await expect(
      hostedBlogAdapter.testConnection({
        siteConnectionId: "s1",
        organizationSlug: "acme",
        baseUrl: null,
        credentials: null,
      })
    ).resolves.toEqual({ ok: true });
  });

  it("publishPost returns the computed URL with no network call", async () => {
    const result = await hostedBlogAdapter.publishPost(
      {
        siteConnectionId: "s1",
        organizationSlug: "acme",
        baseUrl: null,
        credentials: null,
      },
      {
        title: "Hello",
        slug: "hello-world",
        contentHtml: "<p>Hi</p>",
      }
    );

    expect(result).toEqual({
      externalPostId: "hello-world",
      publishedUrl: "https://acme.ourapp.com/blog/hello-world",
    });
  });
});
