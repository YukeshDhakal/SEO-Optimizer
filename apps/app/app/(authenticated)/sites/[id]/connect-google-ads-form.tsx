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
  type DisconnectGoogleAdsState,
  disconnectGoogleAds,
  type FetchGoogleAdsAccountsState,
  fetchGoogleAdsAccounts,
  type SelectGoogleAdsAccountState,
  selectGoogleAdsAccount,
} from "../../../actions/google-ads/accounts";
import {
  type ConnectGoogleAdsState,
  connectGoogleAds,
} from "../../../actions/google-ads/connect";

interface ConnectGoogleAdsFormProperties {
  readonly siteConnectionId: string;
  readonly credentials: {
    status: "pending" | "connected" | "error";
    googleAdsCustomerId: string | null;
  } | null;
  readonly cachedKeywords: {
    keyword: string;
    avgMonthlySearches: number | null;
  }[];
}

const initialConnectState: ConnectGoogleAdsState = {};
const initialFetchState: FetchGoogleAdsAccountsState = {};
const initialSelectState: SelectGoogleAdsAccountState = {};
const initialDisconnectState: DisconnectGoogleAdsState = {};

export const ConnectGoogleAdsForm = ({
  siteConnectionId,
  credentials,
  cachedKeywords,
}: ConnectGoogleAdsFormProperties) => {
  const [connectState, connectAction, isConnecting] = useActionState(
    connectGoogleAds,
    initialConnectState
  );
  const [fetchState, fetchAction, isFetchingAccounts] = useActionState(
    fetchGoogleAdsAccounts,
    initialFetchState
  );
  const [selectState, selectAction, isSelecting] = useActionState(
    selectGoogleAdsAccount,
    initialSelectState
  );
  const [disconnectState, disconnectAction, isDisconnecting] = useActionState(
    disconnectGoogleAds,
    initialDisconnectState
  );
  const [selectedAccount, setSelectedAccount] = useState("");

  const accounts = fetchState.accounts ?? [];

  // Tokens saved, no account chosen yet — the callback route lands here when
  // the connected Google account can access more than one Ads account.
  const needsAccountPicker =
    credentials?.status === "pending" && !credentials.googleAdsCustomerId;

  if (credentials?.status === "connected") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Ads</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            Connected to account{" "}
            <span className="font-medium">
              {credentials.googleAdsCustomerId}
            </span>
          </p>
          {cachedKeywords.length > 0 && (
            <div className="flex flex-col gap-1 text-muted-foreground text-sm">
              <p>Keyword volume (last sync):</p>
              <ul className="list-inside list-disc">
                {cachedKeywords.map((k) => (
                  <li key={k.keyword}>
                    {k.keyword} — {k.avgMonthlySearches ?? "—"} searches/mo
                  </li>
                ))}
              </ul>
            </div>
          )}
          {disconnectState.error && (
            <p className="text-destructive text-sm">{disconnectState.error}</p>
          )}
          <form action={disconnectAction}>
            <input
              name="site_connection_id"
              type="hidden"
              value={siteConnectionId}
            />
            <Button
              disabled={isDisconnecting}
              size="sm"
              type="submit"
              variant="outline"
            >
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (needsAccountPicker) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Ads</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {accounts.length === 0 ? (
            <form action={fetchAction} className="flex flex-col gap-4">
              <input
                name="site_connection_id"
                type="hidden"
                value={siteConnectionId}
              />
              <p className="text-muted-foreground text-sm">
                This Google account can access more than one Ads account — load
                them to pick which one grounds keyword research for this site.
              </p>
              {fetchState.error && (
                <p className="text-destructive text-sm">{fetchState.error}</p>
              )}
              <Button
                className="self-start"
                disabled={isFetchingAccounts}
                type="submit"
              >
                {isFetchingAccounts ? "Loading…" : "Load accounts"}
              </Button>
            </form>
          ) : (
            <form action={selectAction} className="flex flex-col gap-4">
              <input
                name="site_connection_id"
                type="hidden"
                value={siteConnectionId}
              />
              <select
                className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                name="google_ads_customer_id"
                onChange={(event) => setSelectedAccount(event.target.value)}
                value={selectedAccount || accounts[0]?.customerId}
              >
                {accounts.map((account) => (
                  <option key={account.customerId} value={account.customerId}>
                    {account.customerId}
                  </option>
                ))}
              </select>
              {selectState.error && (
                <p className="text-destructive text-sm">{selectState.error}</p>
              )}
              <Button
                className="self-start"
                disabled={isSelecting}
                type="submit"
              >
                {isSelecting ? "Saving…" : "Use this account"}
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
        <CardTitle className="text-base">Google Ads</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Connect this site's Google Ads account so generated posts get checked
          against real Keyword Planner search volume before publishing.
        </p>
        {credentials?.status === "error" && (
          <p className="text-destructive text-sm">
            The last connection attempt failed — try again.
          </p>
        )}
        {connectState.error && (
          <p className="text-destructive text-sm">{connectState.error}</p>
        )}
        <form action={connectAction}>
          <input
            name="site_connection_id"
            type="hidden"
            value={siteConnectionId}
          />
          <Button disabled={isConnecting} type="submit">
            {isConnecting ? "Redirecting…" : "Connect Google Ads"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
