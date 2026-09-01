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
  type ConnectWebflowState,
  connectWebflowSite,
  type FetchWebflowFieldsState,
  fetchWebflowFields,
} from "../../../actions/site-connections/credentials";

const initialFetchState: FetchWebflowFieldsState = {};
const initialConnectState: ConnectWebflowState = {};
const NONE = "__none__";

interface ConnectWebflowFormProperties {
  readonly siteConnectionId: string;
}

// Same two-step shape as the Shopify form: load the collection's real
// field slugs first (Webflow has no fixed post schema, so these are
// genuinely unpredictable per site), then map body/meta title/meta
// description to them and save. Body is required; the two meta fields are
// optional since not every collection has an equivalent.
export const ConnectWebflowForm = ({
  siteConnectionId,
}: ConnectWebflowFormProperties) => {
  const [apiToken, setApiToken] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [fetchState, fetchAction, isFetching] = useActionState(
    fetchWebflowFields,
    initialFetchState
  );
  const [connectState, connectAction, isConnecting] = useActionState(
    connectWebflowSite,
    initialConnectState
  );

  const fields = fetchState.fields ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect Webflow</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fields.length === 0 ? (
          <form action={fetchAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="api_token">Site API token</Label>
              <Input
                id="api_token"
                name="api_token"
                onChange={(event) => setApiToken(event.target.value)}
                required
                type="password"
                value={apiToken}
              />
              <p className="text-muted-foreground text-xs">
                Webflow site settings → Apps &amp; integrations → API access
                → Generate API token, with read/write access to the CMS.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="collection_id">Collection ID</Label>
              <Input
                id="collection_id"
                name="collection_id"
                onChange={(event) => setCollectionId(event.target.value)}
                required
                value={collectionId}
              />
              <p className="text-muted-foreground text-xs">
                The CMS collection that holds your blog posts — find its ID
                in Webflow's Collection settings panel.
              </p>
            </div>
            {fetchState.error && (
              <p className="font-medium text-destructive text-sm">{fetchState.error}</p>
            )}
            <Button className="self-start" disabled={isFetching} type="submit">
              {isFetching ? "Loading fields…" : "Load fields"}
            </Button>
          </form>
        ) : (
          <form action={connectAction} className="flex flex-col gap-4">
            <input
              name="site_connection_id"
              type="hidden"
              value={siteConnectionId}
            />
            <input name="api_token" type="hidden" value={apiToken} />
            <input name="collection_id" type="hidden" value={collectionId} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="field_body">Body field</Label>
              <select
                className="h-10 border-[3px] border-foreground bg-input px-3 font-bold text-sm outline-none focus-visible:shadow-[4px_4px_0_#2B44FF]"
                defaultValue={fields[0]?.slug}
                id="field_body"
                name="field_body"
                required
              >
                {fields.map((field) => (
                  <option key={field.slug} value={field.slug}>
                    {field.displayName} ({field.slug})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="field_meta_title">
                Meta title field (optional)
              </Label>
              <select
                className="h-10 border-[3px] border-foreground bg-input px-3 font-bold text-sm outline-none focus-visible:shadow-[4px_4px_0_#2B44FF]"
                defaultValue={NONE}
                id="field_meta_title"
                name="field_meta_title"
              >
                <option value={NONE}>— none —</option>
                {fields.map((field) => (
                  <option key={field.slug} value={field.slug}>
                    {field.displayName} ({field.slug})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="field_meta_description">
                Meta description field (optional)
              </Label>
              <select
                className="h-10 border-[3px] border-foreground bg-input px-3 font-bold text-sm outline-none focus-visible:shadow-[4px_4px_0_#2B44FF]"
                defaultValue={NONE}
                id="field_meta_description"
                name="field_meta_description"
              >
                <option value={NONE}>— none —</option>
                {fields.map((field) => (
                  <option key={field.slug} value={field.slug}>
                    {field.displayName} ({field.slug})
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
