"use server";

import { createClient } from "@repo/auth/server";
import {
  getCmsAdapter,
  getCollectionFields,
  listShopifyBlogs,
  type ShopifyBlogSummary,
} from "@repo/cms-adapters";
import { revalidatePath } from "next/cache";
import { getCurrentOrganization } from "../../lib/organization";

export interface ConnectWordPressState {
  error?: string;
  success?: boolean;
}

// Saves WordPress Application Password credentials via the
// `set_site_credentials` RPC (Supabase Vault-backed — the plaintext
// password never lands in an ordinary table row) and immediately tests
// them, updating `site_connections.status` with the real result rather
// than optimistically marking it 'connected'.
export const connectWordPressSite = async (
  _prevState: ConnectWordPressState,
  formData: FormData
): Promise<ConnectWordPressState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const applicationPassword = String(
    formData.get("application_password") ?? ""
  ).trim();

  if (!(siteConnectionId && username && applicationPassword)) {
    return { error: "Username and application password are required." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("*")
    .eq("id", siteConnectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    return { error: "Site not found." };
  }

  const adapter = getCmsAdapter(site.cms_type);
  if (!adapter) {
    return { error: `No adapter registered for "${site.cms_type}".` };
  }

  const { error: rpcError } = await supabase.rpc("set_site_credentials", {
    p_site_connection_id: siteConnectionId,
    p_secret: { username, applicationPassword },
  });

  if (rpcError) {
    return { error: "Couldn't save credentials. Please try again." };
  }

  const testResult = await adapter.testConnection({
    siteConnectionId,
    organizationSlug: organization.slug,
    baseUrl: site.base_url,
    credentials: { username, applicationPassword },
  });

  await supabase
    .from("site_connections")
    .update({ status: testResult.ok ? "connected" : "error" })
    .eq("id", siteConnectionId);

  revalidatePath("/sites");
  revalidatePath(`/sites/${siteConnectionId}`);

  if (!testResult.ok) {
    return {
      error: testResult.error ?? "Couldn't verify the WordPress connection.",
    };
  }

  return { success: true };
};

// --- Shopify ---------------------------------------------------------

export interface FetchShopifyBlogsState {
  error?: string;
  blogs?: ShopifyBlogSummary[];
}

// A read-only lookup, separate from the save step below, so the connect
// form can let the user pick a real blog from their store rather than
// typing a raw GraphQL id blind. Takes the shop domain + token directly
// (not a siteConnectionId) since nothing has been saved yet at this point.
export const fetchShopifyBlogs = async (
  _prevState: FetchShopifyBlogsState,
  formData: FormData
): Promise<FetchShopifyBlogsState> => {
  const shopDomain = String(formData.get("shop_domain") ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const accessToken = String(formData.get("access_token") ?? "").trim();

  if (!(shopDomain && accessToken)) {
    return { error: "Shop domain and access token are required." };
  }

  const result = await listShopifyBlogs(shopDomain, accessToken);
  if (!result.ok) {
    return { error: result.error };
  }

  if (result.blogs.length === 0) {
    return { error: "This store has no blogs. Create one in Shopify admin first." };
  }

  return { blogs: result.blogs };
};

export interface ConnectShopifyState {
  error?: string;
  success?: boolean;
}

export const connectShopifySite = async (
  _prevState: ConnectShopifyState,
  formData: FormData
): Promise<ConnectShopifyState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const accessToken = String(formData.get("access_token") ?? "").trim();
  const blogId = String(formData.get("blog_id") ?? "").trim();
  const blogHandle = String(formData.get("blog_handle") ?? "").trim();

  if (!(siteConnectionId && accessToken && blogId && blogHandle)) {
    return { error: "Access token and blog are required." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("*")
    .eq("id", siteConnectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    return { error: "Site not found." };
  }

  const adapter = getCmsAdapter(site.cms_type);
  if (!adapter) {
    return { error: `No adapter registered for "${site.cms_type}".` };
  }

  const credentials = { accessToken, blogId, blogHandle };

  const { error: rpcError } = await supabase.rpc("set_site_credentials", {
    p_site_connection_id: siteConnectionId,
    p_secret: credentials,
  });

  if (rpcError) {
    return { error: "Couldn't save credentials. Please try again." };
  }

  const testResult = await adapter.testConnection({
    siteConnectionId,
    organizationSlug: organization.slug,
    baseUrl: site.base_url,
    credentials,
  });

  await supabase
    .from("site_connections")
    .update({ status: testResult.ok ? "connected" : "error" })
    .eq("id", siteConnectionId);

  revalidatePath("/sites");
  revalidatePath(`/sites/${siteConnectionId}`);

  if (!testResult.ok) {
    return {
      error: testResult.error ?? "Couldn't verify the Shopify connection.",
    };
  }

  return { success: true };
};

// --- Webflow -----------------------------------------------------------

export interface FetchWebflowFieldsState {
  error?: string;
  fields?: { slug: string; displayName: string; type: string }[];
}

// Same read-before-save shape as fetchShopifyBlogs above - lets the connect
// form show the collection's real field slugs for mapping instead of
// making the user dig them out of Webflow's own UI by hand.
export const fetchWebflowFields = async (
  _prevState: FetchWebflowFieldsState,
  formData: FormData
): Promise<FetchWebflowFieldsState> => {
  const apiToken = String(formData.get("api_token") ?? "").trim();
  const collectionId = String(formData.get("collection_id") ?? "").trim();

  if (!(apiToken && collectionId)) {
    return { error: "API token and collection ID are required." };
  }

  const result = await getCollectionFields(apiToken, collectionId);
  if (!result.ok) {
    return { error: result.error };
  }

  return { fields: result.fields };
};

export interface ConnectWebflowState {
  error?: string;
  success?: boolean;
}

// The connect form uses "__none__" as a real <option> value for "no field
// mapped" (a native <select> can't have an empty-string option value that
// still submits reliably) - normalize it back to "" here, which is what
// the adapter's isWebflowCredentials/publishPost treat as "not mapped".
const NONE_FIELD_SENTINEL = "__none__";

const normalizeOptionalField = (raw: FormDataEntryValue | null): string => {
  const value = String(raw ?? "").trim();
  return value === NONE_FIELD_SENTINEL ? "" : value;
};

export const connectWebflowSite = async (
  _prevState: ConnectWebflowState,
  formData: FormData
): Promise<ConnectWebflowState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const apiToken = String(formData.get("api_token") ?? "").trim();
  const collectionId = String(formData.get("collection_id") ?? "").trim();
  const fieldBody = String(formData.get("field_body") ?? "").trim();
  const fieldMetaTitle = normalizeOptionalField(
    formData.get("field_meta_title")
  );
  const fieldMetaDescription = normalizeOptionalField(
    formData.get("field_meta_description")
  );

  if (!(siteConnectionId && apiToken && collectionId && fieldBody)) {
    return {
      error: "API token, collection, and a body field mapping are required.",
    };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("*")
    .eq("id", siteConnectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    return { error: "Site not found." };
  }

  const adapter = getCmsAdapter(site.cms_type);
  if (!adapter) {
    return { error: `No adapter registered for "${site.cms_type}".` };
  }

  const credentials = {
    apiToken,
    collectionId,
    fieldBody,
    fieldMetaTitle,
    fieldMetaDescription,
  };

  const { error: rpcError } = await supabase.rpc("set_site_credentials", {
    p_site_connection_id: siteConnectionId,
    p_secret: credentials,
  });

  if (rpcError) {
    return { error: "Couldn't save credentials. Please try again." };
  }

  const testResult = await adapter.testConnection({
    siteConnectionId,
    organizationSlug: organization.slug,
    baseUrl: site.base_url,
    credentials,
  });

  await supabase
    .from("site_connections")
    .update({ status: testResult.ok ? "connected" : "error" })
    .eq("id", siteConnectionId);

  revalidatePath("/sites");
  revalidatePath(`/sites/${siteConnectionId}`);

  if (!testResult.ok) {
    return {
      error: testResult.error ?? "Couldn't verify the Webflow connection.",
    };
  }

  return { success: true };
};
