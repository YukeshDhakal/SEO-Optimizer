export { hostedBlogAdapter, hostedBlogPostUrl } from "./hosted-blog-adapter";
export { CMS_TYPES, getCmsAdapter } from "./registry";
export {
  listShopifyBlogs,
  shopifyAdapter,
  type ShopifyBlogSummary,
} from "./shopify-adapter";
export type {
  CmsAdapter,
  CmsConnectionConfig,
  PublishPostInput,
  PublishPostResult,
  ShopifyCredentials,
  TestConnectionResult,
  WebflowCredentials,
  WordPressCredentials,
} from "./types";
export { getCollectionFields, webflowAdapter } from "./webflow-adapter";
export { wordpressAdapter } from "./wordpress-adapter";
