import { hostedBlogAdapter } from "./hosted-blog-adapter";
import { shopifyAdapter } from "./shopify-adapter";
import type { CmsAdapter } from "./types";
import { webflowAdapter } from "./webflow-adapter";
import { wordpressAdapter } from "./wordpress-adapter";

// Maps `site_connections.cms_type` -> adapter instance. Adding a new CMS is
// a new adapter file + one registry entry here - no changes to any caller.
const adapters: Record<string, CmsAdapter> = {
  [hostedBlogAdapter.id]: hostedBlogAdapter,
  [wordpressAdapter.id]: wordpressAdapter,
  [webflowAdapter.id]: webflowAdapter,
  [shopifyAdapter.id]: shopifyAdapter,
};

export const CMS_TYPES = Object.keys(adapters);

export const getCmsAdapter = (cmsType: string): CmsAdapter | null =>
  adapters[cmsType] ?? null;
