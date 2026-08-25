import type {
  CmsAdapter,
  CmsConnectionConfig,
  PublishPostInput,
  PublishPostResult,
  TestConnectionResult,
  WordPressCredentials,
} from "./types";

const isWordPressCredentials = (
  value: Record<string, string> | null
): value is WordPressCredentials =>
  typeof value?.username === "string" &&
  typeof value?.applicationPassword === "string";

const basicAuthHeader = (credentials: WordPressCredentials): string =>
  `Basic ${Buffer.from(
    `${credentials.username}:${credentials.applicationPassword}`
  ).toString("base64")}`;

const requireBaseUrl = (config: CmsConnectionConfig): string => {
  if (!config.baseUrl) {
    throw new Error("No site URL configured for this WordPress connection.");
  }
  // wp-json paths are appended below - normalize away a trailing slash so
  // the join is never a double slash.
  return config.baseUrl.replace(/\/+$/, "");
};

export const wordpressAdapter: CmsAdapter = {
  id: "wordpress",

  async testConnection(
    config: CmsConnectionConfig
  ): Promise<TestConnectionResult> {
    if (!isWordPressCredentials(config.credentials)) {
      return {
        ok: false,
        error: "Missing WordPress username/application password.",
      };
    }

    let baseUrl: string;
    try {
      baseUrl = requireBaseUrl(config);
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }

    try {
      const response = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: basicAuthHeader(config.credentials) },
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `WordPress rejected the credentials (HTTP ${response.status}).`,
        };
      }

      return { ok: true };
    } catch {
      return {
        ok: false,
        error: "Couldn't reach that WordPress site. Check the URL.",
      };
    }
  },

  async publishPost(
    config: CmsConnectionConfig,
    input: PublishPostInput
  ): Promise<PublishPostResult> {
    if (!isWordPressCredentials(config.credentials)) {
      throw new Error("Missing WordPress username/application password.");
    }

    const baseUrl = requireBaseUrl(config);

    // WP core has no meta_title/meta_description fields of its own (those
    // come from SEO plugins like Yoast/RankMath, which vary per site and
    // are out of scope for this MVP adapter) - title/content/slug/status
    // only.
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(config.credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        content: input.contentHtml,
        slug: input.slug,
        status: "publish",
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body?.message ?? `WordPress publish failed (HTTP ${response.status}).`
      );
    }

    const body = (await response.json()) as { id: number; link: string };

    return {
      externalPostId: String(body.id),
      publishedUrl: body.link,
    };
  },
};
