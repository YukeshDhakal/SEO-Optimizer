import type {
  CmsAdapter,
  CmsConnectionConfig,
  PublishPostInput,
  PublishPostResult,
  ShopifyCredentials,
  TestConnectionResult,
} from "./types";

// Shopify's REST Admin API is legacy as of Oct 2024, and new apps are
// steered toward the GraphQL Admin API - so this adapter talks GraphQL only,
// via the single-endpoint articleCreate mutation, not blogs/{id}/articles.json.
const API_VERSION = "2026-07";

const isShopifyCredentials = (
  value: Record<string, string> | null
): value is ShopifyCredentials =>
  typeof value?.accessToken === "string" &&
  typeof value?.blogId === "string" &&
  typeof value?.blogHandle === "string";

const requireShopDomain = (config: CmsConnectionConfig): string => {
  if (!config.baseUrl) {
    throw new Error(
      "No shop domain configured for this Shopify connection (expected e.g. your-store.myshopify.com)."
    );
  }
  return config.baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

const graphqlUrl = (shopDomain: string): string =>
  `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`;

interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

const shopifyGraphql = async <T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
): Promise<GraphqlResponse<T>> => {
  const response = await fetch(graphqlUrl(shopDomain), {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error (HTTP ${response.status}).`);
  }

  return (await response.json()) as GraphqlResponse<T>;
};

// Exported so the "connect a site" server action can list a shop's blogs and
// let the user pick one, rather than making them type a raw blogId blind.
export interface ShopifyBlogSummary {
  id: string;
  handle: string;
  title: string;
}

// A real discriminated union (literal `true`/`false`, not TestConnectionResult's
// plain `boolean`) so a caller's `if (!result.ok)` narrows cleanly instead of
// leaving `blogs` possibly-undefined on the `ok: true` branch.
export type ListShopifyBlogsResult =
  | { ok: true; blogs: ShopifyBlogSummary[] }
  | { ok: false; error: string };

export const listShopifyBlogs = async (
  shopDomain: string,
  accessToken: string
): Promise<ListShopifyBlogsResult> => {
  try {
    const result = await shopifyGraphql<{
      blogs: { edges: { node: ShopifyBlogSummary }[] };
    }>(
      shopDomain,
      accessToken,
      `query ListBlogs {
        blogs(first: 50) {
          edges { node { id handle title } }
        }
      }`,
      {}
    );

    if (result.errors?.length) {
      return { ok: false, error: result.errors[0].message };
    }
    if (!result.data) {
      return { ok: false, error: "Shopify returned an empty response." };
    }

    return {
      ok: true,
      blogs: result.data.blogs.edges.map((edge) => edge.node),
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach that Shopify store. Check the shop domain.",
    };
  }
};

export const shopifyAdapter: CmsAdapter = {
  id: "shopify",

  async testConnection(
    config: CmsConnectionConfig
  ): Promise<TestConnectionResult> {
    if (!isShopifyCredentials(config.credentials)) {
      return {
        ok: false,
        error: "Missing Shopify access token/blog selection.",
      };
    }

    let shopDomain: string;
    try {
      shopDomain = requireShopDomain(config);
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }

    const result = await listShopifyBlogs(
      shopDomain,
      config.credentials.accessToken
    );
    if (!result.ok) {
      return result;
    }

    const stillExists = result.blogs.some(
      (blog) => blog.id === config.credentials?.blogId
    );
    if (!stillExists) {
      return {
        ok: false,
        error:
          "The configured blog no longer exists on this store, or the token can't see it.",
      };
    }

    return { ok: true };
  },

  async publishPost(
    config: CmsConnectionConfig,
    input: PublishPostInput
  ): Promise<PublishPostResult> {
    if (!isShopifyCredentials(config.credentials)) {
      throw new Error("Missing Shopify access token/blog selection.");
    }

    const shopDomain = requireShopDomain(config);
    const { accessToken, blogId, blogHandle } = config.credentials;

    // Shopify's Article type has no seo{title,description} field and no
    // onlineStoreUrl field (verified against the current Admin GraphQL
    // schema) - meta title/description have nowhere to go here, same
    // core-vs-plugin limitation as WordPress's own missing Yoast fields.
    // publishedUrl is built manually from the blog's handle + the new
    // article's handle, Shopify's standard storefront URL shape.
    const result = await shopifyGraphql<{
      articleCreate: {
        article: { id: string; handle: string } | null;
        userErrors: { field: string[] | null; message: string }[];
      };
    }>(
      shopDomain,
      accessToken,
      `mutation CreateArticle($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { id handle }
          userErrors { field message }
        }
      }`,
      {
        article: {
          blogId,
          title: input.title,
          body: input.contentHtml,
          handle: input.slug,
          isPublished: true,
        },
      }
    );

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    const userErrors = result.data?.articleCreate.userErrors ?? [];
    if (userErrors.length > 0) {
      throw new Error(userErrors[0].message);
    }

    const article = result.data?.articleCreate.article;
    if (!article) {
      throw new Error("Shopify did not return the created article.");
    }

    return {
      externalPostId: article.id,
      publishedUrl: `https://${shopDomain}/blogs/${blogHandle}/${article.handle}`,
    };
  },
};
