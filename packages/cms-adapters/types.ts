// A CmsAdapter is intentionally pure: it never touches the `posts` table
// itself. The caller (a server action in apps/app) owns the DB write —
// create a 'draft' row, call the adapter, then update that row with the
// result (or mark it 'failed'). This keeps every adapter symmetric and
// keeps "what actually happened in Postgres" in one place, not scattered
// across N adapter implementations.

export interface CmsConnectionConfig {
  siteConnectionId: string;
  organizationSlug: string;
  baseUrl: string | null;
  // Decrypted via the `get_site_credentials` RPC by the caller — shape is
  // adapter-specific (see each adapter's own credentials type below).
  credentials: Record<string, string> | null;
}

export interface PublishPostInput {
  title: string;
  slug: string;
  contentHtml: string;
  metaTitle?: string;
  metaDescription?: string;
}

export interface PublishPostResult {
  externalPostId: string;
  publishedUrl: string;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

export interface CmsAdapter {
  id: string;
  testConnection(config: CmsConnectionConfig): Promise<TestConnectionResult>;
  publishPost(
    config: CmsConnectionConfig,
    input: PublishPostInput
  ): Promise<PublishPostResult>;
  updatePost?(
    config: CmsConnectionConfig,
    externalId: string,
    input: PublishPostInput
  ): Promise<PublishPostResult>;
}

export interface WordPressCredentials {
  username: string;
  applicationPassword: string;
  // Index signature so this is assignable to CmsConnectionConfig's plain
  // `Record<string, string>` credentials bag - purely a structural-typing
  // convenience, every real field above is still typed as `string`.
  [key: string]: string;
}
