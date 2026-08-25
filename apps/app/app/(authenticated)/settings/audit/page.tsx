import { createClient } from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../lib/organization";

export const metadata: Metadata = { title: "Audit log" };

const badgeVariant = (action: string) => {
  if (action.includes("blocked") || action.includes("rejected") || action.includes("failed")) {
    return "destructive" as const;
  }
  if (action.includes("published") || action.includes("granted") || action.includes("unpaused")) {
    return "default" as const;
  }
  return "secondary" as const;
};

// Read-only — every row here was written server-side (workflow steps, the
// cron dispatcher, or a server action's own service-role write), never by
// a direct client insert. See the `audit_log_select`-only RLS policy.
const AuditLogPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("audit_log")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div>
        <h1 className="font-semibold text-2xl">Audit log</h1>
        <p className="text-muted-foreground text-sm">
          {organization.name} — most recent 100 events
        </p>
      </div>

      {entries && entries.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap font-medium">
                  {new Date(entry.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={badgeVariant(entry.action)}>{entry.action}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.entity_type}
                  {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ""}
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground text-xs">
                  {Object.keys(entry.metadata as Record<string, unknown>).length > 0
                    ? JSON.stringify(entry.metadata)
                    : entry.actor
                      ? `by ${entry.actor.slice(0, 8)}`
                      : "system"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">No audit events yet.</p>
      )}
    </div>
  );
};

export default AuditLogPage;
