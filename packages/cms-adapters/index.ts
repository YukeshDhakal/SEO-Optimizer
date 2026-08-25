export { hostedBlogAdapter, hostedBlogPostUrl } from "./hosted-blog-adapter";
export { CMS_TYPES, getCmsAdapter } from "./registry";
export type {
  CmsAdapter,
  CmsConnectionConfig,
  PublishPostInput,
  PublishPostResult,
  TestConnectionResult,
  WordPressCredentials,
} from "./types";
export { wordpressAdapter } from "./wordpress-adapter";
