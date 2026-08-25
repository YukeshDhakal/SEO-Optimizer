import type {
  CmsAdapter,
  CmsConnectionConfig,
  PublishPostInput,
  PublishPostResult,
  TestConnectionResult,
  WebflowCredentials,
} from "./types";

const API_BASE = "https://api.webflow.com/v2";

// Every Webflow collection has built-in "Name"/"Slug" fields under these
// fixed slugs - only body/meta are ever user-defined per collection, which
// is the actual reason this adapter needs field-mapping config at all.
const NAME_FIELD_SLUG = "name";
const SLUG_FIELD_SLUG = "slug";

const isWebflowCredentials = (
  value: Record<string, string> | null
): value is WebflowCredentials =>
  typeof value?.apiToken === "string" &&
  typeof value?.collectionId === "string" &&
  typeof value?.fieldBody === "string";

const authHeaders = (apiToken: string): HeadersInit => ({
  Authorization: `Bearer ${apiToken}`,
  "Content-Type": "application/json",
  "accept-version": "2.0.0",
});

interface WebflowField {
  slug: string;
  displayName: string;
  type: string;
}

interface WebflowCollection {
  id: string;
  slug: string;
  fields: WebflowField[];
}

const getCollection = async (
  apiToken: string,
  collectionId: string
): Promise<WebflowCollection> => {
  const response = await fetch(`${API_BASE}/collections/${collectionId}`, {
    headers: authHeaders(apiToken),
  });

  if (!response.ok) {
    throw new Error(
      `Webflow rejected the collection lookup (HTTP ${response.status}).`
    );
  }

  return (await response.json()) as WebflowCollection;
};

// A real discriminated union (literal `true`/`false`), same reasoning as
// ListShopifyBlogsResult in shopify-adapter.ts - avoids TestConnectionResult's
// plain `boolean` making `fields` possibly-undefined on the ok branch.
export type GetCollectionFieldsResult =
  | { ok: true; fields: WebflowField[] }
  | { ok: false; error: string };

// Exported so the "connect a site" server action can show the collection's
// real field list and let the user pick which ones map to body/meta,
// instead of making them guess Webflow's internal field slugs blind.
export const getCollectionFields = async (
  apiToken: string,
  collectionId: string
): Promise<GetCollectionFieldsResult> => {
  try {
    const collection = await getCollection(apiToken, collectionId);
    return { ok: true, fields: collection.fields };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Couldn't reach Webflow. Check the API token and collection ID.",
    };
  }
};

export const webflowAdapter: CmsAdapter = {
  id: "webflow",

  async testConnection(
    config: CmsConnectionConfig
  ): Promise<TestConnectionResult> {
    if (!isWebflowCredentials(config.credentials)) {
      return {
        ok: false,
        error: "Missing Webflow API token, collection, or field mapping.",
      };
    }

    const { apiToken, collectionId, fieldBody, fieldMetaTitle, fieldMetaDescription } =
      config.credentials;

    const result = await getCollectionFields(apiToken, collectionId);
    if (!result.ok) {
      return result;
    }

    // name/slug are built-in on every collection, never validated here -
    // only the collection-specific mappings the user actually configured.
    const knownSlugs = new Set(result.fields.map((field) => field.slug));
    const configured = [
      ["body", fieldBody],
      ["meta title", fieldMetaTitle],
      ["meta description", fieldMetaDescription],
    ] as const;

    for (const [label, slug] of configured) {
      if (slug && !knownSlugs.has(slug)) {
        return {
          ok: false,
          error: `The configured "${label}" field ("${slug}") doesn't exist on this collection anymore.`,
        };
      }
    }

    return { ok: true };
  },

  async publishPost(
    config: CmsConnectionConfig,
    input: PublishPostInput
  ): Promise<PublishPostResult> {
    if (!isWebflowCredentials(config.credentials)) {
      throw new Error("Missing Webflow API token, collection, or field mapping.");
    }

    const {
      apiToken,
      collectionId,
      fieldBody,
      fieldMetaTitle,
      fieldMetaDescription,
    } = config.credentials;

    const fieldData: Record<string, string> = {
      [NAME_FIELD_SLUG]: input.title,
      [SLUG_FIELD_SLUG]: input.slug,
      [fieldBody]: input.contentHtml,
    };
    if (fieldMetaTitle && input.metaTitle) {
      fieldData[fieldMetaTitle] = input.metaTitle;
    }
    if (fieldMetaDescription && input.metaDescription) {
      fieldData[fieldMetaDescription] = input.metaDescription;
    }

    // The /items/live endpoint creates the item as genuinely live
    // (isDraft: false) in one call - no separate "publish site" step is
    // needed for the item's own content to go out, per Webflow's Data API
    // v2 publishing model (confirmed against current docs, Dec 2024
    // behavior change).
    const response = await fetch(
      `${API_BASE}/collections/${collectionId}/items/live`,
      {
        method: "POST",
        headers: authHeaders(apiToken),
        body: JSON.stringify({
          fieldData,
          isDraft: false,
          isArchived: false,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        (body as { message?: string })?.message ??
          `Webflow publish failed (HTTP ${response.status}).`
      );
    }

    const body = (await response.json()) as {
      id: string;
      fieldData: { slug: string };
    };

    // Webflow's item response has no live URL field - this is a best-effort
    // reconstruction using the collection's default auto-generated page
    // pattern (/{collectionSlug}/{itemSlug}). A site that customized its
    // collection page's static URL segment in the Designer will not match
    // this - there is no API to read the actual bound page path.
    let collectionSlug: string;
    try {
      const collection = await getCollection(apiToken, collectionId);
      collectionSlug = collection.slug;
    } catch {
      collectionSlug = collectionId;
    }

    const siteBase = (config.baseUrl ?? "").replace(/\/+$/, "");
    return {
      externalPostId: body.id,
      publishedUrl: `${siteBase}/${collectionSlug}/${body.fieldData.slug}`,
    };
  },
};
