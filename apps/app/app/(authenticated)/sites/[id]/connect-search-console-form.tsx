"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { useActionState, useState } from "react";
import {
  type ConnectSearchConsoleState,
  connectSearchConsole,
} from "../../../actions/search-console/connect";
import {
  type DisconnectSearchConsoleState,
  disconnectSearchConsole,
  type FetchSearchConsolePropertiesState,
  fetchSearchConsoleProperties,
  type SelectSearchConsolePropertyState,
  selectSearchConsoleProperty,
} from "../../../actions/search-console/properties";

interface ConnectSearchConsoleFormProperties {
  readonly siteConnectionId: string;
  readonly credentials: {
    status: "pending" | "connected" | "error";
    gscSiteUrl: string | null;
  } | null;
  readonly topQueries: { query: string; clicks: number }[];
}

const initialConnectState: ConnectSearchConsoleState = {};
const initialFetchState: FetchSearchConsolePropertiesState = {};
const initialSelectState: SelectSearchConsolePropertyState = {};
const initialDisconnectState: DisconnectSearchConsoleState = {};

export const ConnectSearchConsoleForm = ({
  siteConnectionId,
  credentials,
  topQueries,
}: ConnectSearchConsoleFormProperties) => {
  const [connectState, connectAction, isConnecting] = useActionState(
    connectSearchConsole,
    initialConnectState
  );
  const [fetchState, fetchAction, isFetchingProperties] = useActionState(
    fetchSearchConsoleProperties,
    initialFetchState
  );
  const [selectState, selectAction, isSelecting] = useActionState(
    selectSearchConsoleProperty,
    initialSelectState
  );
  const [disconnectState, disconnectAction, isDisconnecting] = useActionState(
    disconnectSearchConsole,
    initialDisconnectState
  );
  const [selectedProperty, setSelectedProperty] = useState("");

  const properties = fetchState.properties ?? [];

  // Tokens saved, no property chosen yet — the callback route lands here
  // when the connected Google account has more than one verified property.
  const needsPropertyPicker =
    credentials?.status === "pending" && !credentials.gscSiteUrl;

  if (credentials?.status === "connected") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Search Console</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            Connected to{" "}
            <span className="font-medium">{credentials.gscSiteUrl}</span>
          </p>
          {topQueries.length > 0 && (
            <div className="flex flex-col gap-1 text-muted-foreground text-sm">
              <p>Top queries (last sync):</p>
              <ul className="list-inside list-disc">
                {topQueries.map((q) => (
                  <li key={q.query}>
                    {q.query} — {q.clicks} clicks
                  </li>
                ))}
              </ul>
            </div>
          )}
          {disconnectState.error && (
            <p className="font-medium text-destructive text-sm">{disconnectState.error}</p>
          )}
          <form action={disconnectAction}>
            <input name="site_connection_id" type="hidden" value={siteConnectionId} />
            <Button disabled={isDisconnecting} size="sm" type="submit" variant="outline">
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (needsPropertyPicker) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Search Console</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {properties.length === 0 ? (
            <form action={fetchAction} className="flex flex-col gap-4">
              <input name="site_connection_id" type="hidden" value={siteConnectionId} />
              <p className="text-muted-foreground text-sm">
                This Google account can verify more than one property — load
                them to pick which one is this site.
              </p>
              {fetchState.error && (
                <p className="font-medium text-destructive text-sm">{fetchState.error}</p>
              )}
              <Button
                className="self-start"
                disabled={isFetchingProperties}
                type="submit"
              >
                {isFetchingProperties ? "Loading…" : "Load properties"}
              </Button>
            </form>
          ) : (
            <form action={selectAction} className="flex flex-col gap-4">
              <input name="site_connection_id" type="hidden" value={siteConnectionId} />
              <select
                className="h-10 border-[3px] border-foreground bg-input px-3 font-bold text-sm outline-none focus-visible:shadow-[4px_4px_0_#2B44FF]"
                name="gsc_site_url"
                onChange={(event) => setSelectedProperty(event.target.value)}
                value={selectedProperty || properties[0]?.siteUrl}
              >
                {properties.map((property) => (
                  <option key={property.siteUrl} value={property.siteUrl}>
                    {property.siteUrl}
                  </option>
                ))}
              </select>
              {selectState.error && (
                <p className="font-medium text-destructive text-sm">{selectState.error}</p>
              )}
              <Button className="self-start" disabled={isSelecting} type="submit">
                {isSelecting ? "Saving…" : "Use this property"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Search Console</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Connect this site's Google Search Console property so topic
          selection can ground suggestions in real search query data.
        </p>
        {credentials?.status === "error" && (
          <p className="font-medium text-destructive text-sm">
            The last connection attempt failed — try again.
          </p>
        )}
        {connectState.error && (
          <p className="font-medium text-destructive text-sm">{connectState.error}</p>
        )}
        <form action={connectAction}>
          <input name="site_connection_id" type="hidden" value={siteConnectionId} />
          <Button disabled={isConnecting} type="submit">
            {isConnecting ? "Redirecting…" : "Connect Google Search Console"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
