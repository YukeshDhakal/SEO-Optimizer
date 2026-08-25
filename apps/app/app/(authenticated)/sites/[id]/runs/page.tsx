import { createClient } from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../lib/organization";

export const metadata: Metadata = {
  title: "Generation runs",
};

interface RunsPageProperties {
  readonly params: Promise<{ id: string }>;
}

const statusVariant = (status: string) => {
  if (status === "succeeded") {
    return "default" as const;
  }
  if (status === "failed" || status === "blocked") {
    return "destructive" as const;
  }
  return "secondary" as const;
};

const RunsPage = async ({ params }: RunsPageProperties) => {
  const { id } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("display_name")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("site_connection_id", id)
    .order("started_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl">
          Generation runs — {site.display_name}
        </h1>
        <Button asChild>
          <Link href={`/sites/${id}/generate`}>Generate</Link>
        </Button>
      </div>

      {runs && runs.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current step</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="font-medium">
                  {new Date(run.started_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(run.status)}>
                    {run.status}
                  </Badge>
                </TableCell>
                <TableCell>{run.current_step ?? "—"}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/sites/${id}/runs/${run.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">
          No generation runs yet for this site.
        </p>
      )}
    </div>
  );
};

export default RunsPage;
