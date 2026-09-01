"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useActionState, useState } from "react";
import {
  type ConnectShopifyState,
  connectShopifySite,
  type FetchShopifyBlogsState,
  fetchShopifyBlogs,
} from "../../../actions/site-connections/credentials";

const initialFetchState: FetchShopifyBlogsState = {};
const initialConnectState: ConnectShopifyState = {};

interface ConnectShopifyFormProperties {
  readonly siteConnectionId: string;
  readonly shopDomain: string;
}

// Two steps, two server actions: fetch the store's real blogs first (so the
// user picks one instead of typing a raw GraphQL id), then save + test the
// chosen blog's credentials. accessToken and the chosen blog are kept in
// local state across both steps rather than re-typed/re-selected via DOM
// lookups, since the fetch step already proved the token works.
export const ConnectShopifyForm = ({
  siteConnectionId,
  shopDomain,
}: ConnectShopifyFormProperties) => {
  const [accessToken, setAccessToken] = useState("");
  const [selectedBlog, setSelectedBlog] = useState<{
    id: string;
    handle: string;
  } | null>(null);
  const [fetchState, fetchAction, isFetching] = useActionState(
    async (
      prevState: FetchShopifyBlogsState,
      formData: FormData
    ): Promise<FetchShopifyBlogsState> => {
      const result = await fetchShopifyBlogs(prevState, formData);
      if (result.blogs && result.blogs.length > 0) {
        setSelectedBlog({
          id: result.blogs[0].id,
          handle: result.blogs[0].handle,
        });
      }
      return result;
    },
    initialFetchState
  );
  const [connectState, connectAction, isConnecting] = useActionState(
    connectShopifySite,
    initialConnectState
  );

  const blogs = fetchState.blogs ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect Shopify</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {blogs.length === 0 || !selectedBlog ? (
          <form action={fetchAction} className="flex flex-col gap-4">
            <input name="shop_domain" type="hidden" value={shopDomain} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="access_token">Admin API access token</Label>
              <Input
                id="access_token"
                name="access_token"
                onChange={(event) => setAccessToken(event.target.value)}
                required
                type="password"
                value={accessToken}
              />
              <p className="text-muted-foreground text-xs">
                Shopify admin → Settings → Apps and sales channels → Develop
                apps → create an app with the Content API's read/write
                scope, then install it and copy the Admin API access token.
              </p>
            </div>
            {fetchState.error && (
              <p className="font-medium text-destructive text-sm">{fetchState.error}</p>
            )}
            <Button className="self-start" disabled={isFetching} type="submit">
              {isFetching ? "Looking up blogs…" : "Find blogs"}
            </Button>
          </form>
        ) : (
          <form action={connectAction} className="flex flex-col gap-4">
            <input
              name="site_connection_id"
              type="hidden"
              value={siteConnectionId}
            />
            <input name="access_token" type="hidden" value={accessToken} />
            <input name="blog_id" type="hidden" value={selectedBlog.id} />
            <input
              name="blog_handle"
              type="hidden"
              value={selectedBlog.handle}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="blog">Blog</Label>
              <select
                className="h-10 border-[3px] border-foreground bg-input px-3 font-bold text-sm outline-none focus-visible:shadow-[4px_4px_0_#2B44FF]"
                id="blog"
                onChange={(event) => {
                  const blog = blogs.find(
                    (candidate) => candidate.id === event.target.value
                  );
                  if (blog) {
                    setSelectedBlog({ id: blog.id, handle: blog.handle });
                  }
                }}
                value={selectedBlog.id}
              >
                {blogs.map((blog) => (
                  <option key={blog.id} value={blog.id}>
                    {blog.title}
                  </option>
                ))}
              </select>
            </div>
            {connectState.error && (
              <p className="font-medium text-destructive text-sm">{connectState.error}</p>
            )}
            {connectState.success && (
              <p className="font-bold text-sm text-status-success-fg">
                Connected.
              </p>
            )}
            <Button
              className="self-start"
              disabled={isConnecting}
              type="submit"
            >
              {isConnecting ? "Testing…" : "Test & save"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};
