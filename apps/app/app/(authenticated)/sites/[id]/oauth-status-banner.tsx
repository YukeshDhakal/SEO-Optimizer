"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// ROUTING_SPEC.md §4: the search-console/Ads OAuth callbacks redirect back
// here carrying a status query param (?gsc=/?ads=) so "one screen renders
// all six results" - but until now nothing actually read it. Two of those
// six outcomes ("denied", and GSC's "no-properties") leave the DB
// credentials row with no detail distinguishing them from a generic
// failure or from never having connected at all - the query param is the
// only place that information exists, and it was being silently dropped.
// This renders it once, then strips the param (matching the spec's own
// "so a refresh or a shared URL does not replay a stale success banner"
// requirement) - the connect forms' own DB-driven state remains the
// source of truth for anything durable (connected/picker).
const MESSAGES: Record<"gsc" | "ads", Record<string, string>> = {
  gsc: {
    connected: "Search Console connected.",
    pick: "Choose which verified property is this site below.",
    "no-properties":
      "That Google account has no verified Search Console properties. Verify one in Search Console, then try again.",
    denied: "Search Console connection cancelled — consent wasn't granted.",
    error: "Couldn't connect Search Console — try again.",
  },
  ads: {
    connected: "Google Ads connected.",
    pick: "Choose which Ads account is this site below.",
    "no-accounts":
      "That Google account has no accessible Ads accounts. Check the account has the right access, then try again.",
    denied: "Google Ads connection cancelled — consent wasn't granted.",
    error: "Couldn't connect Google Ads — try again.",
  },
};

const isError = (status: string) =>
  status === "error" || status === "denied" || status.startsWith("no-");

export const OAuthStatusBanner = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const gsc = searchParams.get("gsc");
  const ads = searchParams.get("ads");
  const [provider, status] = gsc
    ? (["gsc", gsc] as const)
    : ads
      ? (["ads", ads] as const)
      : [null, null];

  // biome-ignore lint/correctness/useExhaustiveDependencies: only ever
  // needs to re-run when the params it strips actually change.
  useEffect(() => {
    if (!provider) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("gsc");
    next.delete("ads");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [provider, status]);

  if (!(provider && status)) {
    return null;
  }

  const message = MESSAGES[provider][status] ?? MESSAGES[provider].error;
  const failed = isError(status);

  return (
    <div
      className={
        failed
          ? "flex items-start gap-2.5 border-[3px] border-foreground bg-status-error-bg px-4 py-3 font-medium text-sm text-status-error-fg"
          : "flex items-start gap-2.5 border-[3px] border-foreground bg-status-success-bg px-4 py-3 font-medium text-sm text-status-success-fg"
      }
    >
      <span className="mt-0.5 font-mono text-xs">{failed ? "✕" : "✓"}</span>
      <p>{message}</p>
    </div>
  );
};
