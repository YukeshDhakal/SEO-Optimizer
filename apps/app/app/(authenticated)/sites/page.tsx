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
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../lib/organization";
import { NewSiteForm } from "./new-site-form";
import { PauseToggleButton } from "./pause-toggle-button";

export const metadata: Metadata = {
  title: "Sites",
};

const statusVariant = (
  status: string
): "success" | "error" | "neutral" => {
  if (status === "connected") {
    return "success";
  }
  if (status === "error") {
    return "error";
  }
  return "neutral";
};

const SitesPage = async () => {
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const canManage = organization.role === "owner" || organization.role === "admin";

  const supabase = await createClient();
  const { data: sites } = await supabase
    .from("site_connections")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div>
        <h1 className="font-semibold text-2xl">Sites</h1>
        <p className="text-muted-foreground text-sm">
          Sites {organization.name} publishes to. Connecting a real CMS
          adapter comes later — this just records the site.
        </p>
      </div>

      {canManage && <NewSiteForm />}

      {sites && sites.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>CMS</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Failures</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((site) => (
              <TableRow key={site.id}>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    href={`/sites/${site.id}`}
                  >
                    {site.display_name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {site.cms_type}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(site.status)}>
                      {site.status}
                    </Badge>
                    {site.paused && <Badge variant="muted">Paused</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {site.consecutive_publish_failures}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <PauseToggleButton
                      id={site.id}
                      organizationId={organization.id}
                      paused={site.paused}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">
          No sites connected yet.
        </p>
      )}
    </div>
  );
};

export default SitesPage;
