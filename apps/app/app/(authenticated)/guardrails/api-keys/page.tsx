import { createClient } from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import { currentPeriodBounds } from "@repo/workflows";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateApiKeyLimit } from "../../../actions/api-keys/mutate";
import { getCurrentOrganization } from "../../../lib/organization";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { RevokeKeyButton } from "./revoke-key-button";

export const metadata: Metadata = { title: "API keys" };

interface UsageCellProperties {
  readonly calls: number;
  readonly limit: number | null;
}

// The direct analogue of n8n's own "459/1000 Executions" counter, which is the
// comparison the customer will actually be making. A null limit is genuinely
// uncapped, so it gets a count with no bar rather than a full or empty one —
// an empty bar would read as "no usage", a full one as "at the limit", and
// both would be wrong.
const UsageCell = ({ calls, limit }: UsageCellProperties) => {
  if (limit === null) {
    return (
      <span className="text-muted-foreground text-xs">{calls} · unlimited</span>
    );
  }

  const atLimit = calls >= limit;
  const percent = Math.min(100, Math.round((calls / limit) * 100));

  return (
    <div className="flex max-w-[140px] flex-col gap-1">
      <span className={cn("font-mono text-xs", atLimit && "text-destructive")}>
        {calls} / {limit}
      </span>
      {/* role="img" so the aria-label is actually announced — a bare div has
          no role for it to attach to. */}
      <div
        aria-label={`${calls} of ${limit} calls used this month`}
        className="h-1.5 w-full border-2 border-foreground bg-muted"
        role="img"
      >
        <div
          className={cn("h-full", atLimit ? "bg-destructive" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

// Org-level, not per-site — which is why this is a `/guardrails` subpage
// alongside Billing and the Audit log rather than a tab on a site.
//
// Every key here is scoped to exactly this organization. The MCP gateway
// resolves the org from the key itself and never reads an organization id from
// the AI client's request, so a customer cannot reach another tenant's data
// even by asking their model to try.
const ApiKeysPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const canManage =
    organization.role === "owner" || organization.role === "admin";

  const supabase = await createClient();

  // Deliberately an explicit column list, never `select("*")`: `key_hash` must
  // not leave the database, not even into a server component's props, where it
  // would end up serialized into the page payload.
  const { data: keys } = await supabase
    .from("api_keys")
    .select(
      "id, name, key_prefix, created_by, monthly_call_limit, last_used_at, revoked_at, created_at"
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  const rows = keys ?? [];

  // The counters live in their own table keyed by (api_key_id, period_start),
  // so this is a second scoped query rather than a join — PostgREST can't
  // left-join on a composite condition like "this period only", and a key with
  // no calls yet has no row at all.
  const { periodStart } = currentPeriodBounds();
  const { data: counters } = rows.length
    ? await supabase
        .from("mcp_usage_counters")
        .select("api_key_id, calls_count")
        .eq("organization_id", organization.id)
        .eq("period_start", periodStart.toISOString())
        .in(
          "api_key_id",
          rows.map((row) => row.id)
        )
    : { data: [] };

  const callsByKey = new Map(
    (counters ?? []).map((row) => [row.api_key_id, row.calls_count])
  );

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">API KEYS</h1>
          <p className="mt-1 max-w-xl text-muted-foreground text-sm">
            Connect an AI client to {organization.name} over MCP. Each key is
            scoped to this organization and nothing else, and can be revoked on
            its own without affecting the others.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CreateApiKeyDialog organizationId={organization.id} />
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-hidden border-[3px] border-foreground">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Calls this month</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((key) => {
                const calls = callsByKey.get(key.id) ?? 0;

                return (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {key.key_prefix}…
                    </TableCell>
                    <TableCell>
                      <UsageCell calls={calls} limit={key.monthly_call_limit} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {key.revoked_at ? (
                        <Badge variant="outline">Revoked</Badge>
                      ) : (
                        <Badge>Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && !key.revoked_at && (
                        <div className="flex items-center justify-end gap-2">
                          {/* Raising or lowering a cap must not require
                              rotating the key — a customer who has pasted it
                              into three clients would otherwise reach for
                              "unlimited" instead of re-pasting it three
                              times. Empty submits as null = no cap. */}
                          <form
                            action={updateApiKeyLimit}
                            className="flex items-center gap-1"
                          >
                            <input name="id" type="hidden" value={key.id} />
                            <Input
                              aria-label={`Monthly call limit for ${key.name}`}
                              className="h-8 w-24 text-xs"
                              defaultValue={key.monthly_call_limit ?? ""}
                              min="1"
                              name="monthly_call_limit"
                              placeholder="No cap"
                              type="number"
                            />
                            <Button size="sm" type="submit" variant="outline">
                              Set
                            </Button>
                          </form>
                          <RevokeKeyButton id={key.id} name={key.name} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No API keys yet. Create one to connect an AI client to this
          organization.
        </p>
      )}

      {canManage ? (
        <div className="max-w-xl border-[3px] border-foreground bg-muted p-4">
          <p className="font-bold text-sm">Connecting a client</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Point your AI client at Quillrun&apos;s MCP endpoint and send the
            key as a bearer token. The key is shown once, at creation — Quillrun
            stores only a hash of it and cannot show it to you again.
          </p>
          <p className="mt-2 text-muted-foreground text-xs">
            Every request counts toward that key&apos;s monthly limit, reads
            included. Once a key hits its limit, calls are refused until the
            first of the next month.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Only owners and admins can create or revoke API keys.
        </p>
      )}

      <div>
        <Link
          className="text-muted-foreground text-xs underline"
          href="/guardrails"
        >
          Back to guardrails
        </Link>
      </div>
    </div>
  );
};

export default ApiKeysPage;
