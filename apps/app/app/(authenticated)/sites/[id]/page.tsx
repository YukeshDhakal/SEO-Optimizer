import { createClient } from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../lib/organization";
import { ConnectWordPressForm } from "./connect-wordpress-form";
import { DeleteSiteButton } from "./delete-site-button";
import { EditSiteForm } from "./edit-site-form";

export const metadata: Metadata = {
  title: "Site details",
};

interface SiteDetailPageProperties {
  readonly params: Promise<{ id: string }>;
}

const SiteDetailPage = async ({ params }: SiteDetailPageProperties) => {
  const { id } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  // Scoped to organization_id too, not just id — RLS already enforces this,
  // but matching it here means a cross-tenant id reliably 404s instead of
  // depending solely on the RLS layer to explain the empty result.
  const { data: site } = await supabase
    .from("site_connections")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const canManage =
    organization.role === "owner" || organization.role === "admin";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">{site.display_name}</h1>
          <p className="text-muted-foreground text-sm">{site.cms_type}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={site.status === "connected" ? "default" : "secondary"}>
            {site.status}
          </Badge>
          {site.paused && <Badge variant="outline">Paused</Badge>}
          <Button asChild size="sm" variant="outline">
            <Link href={`/sites/${site.id}/runs`}>Runs</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/sites/${site.id}/posts`}>Posts</Link>
          </Button>
          {site.status === "connected" && (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={`/sites/${site.id}/generate`}>Generate</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/sites/${site.id}/posts/new`}>New post</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Consecutive failures</dt>
          <dd>{site.consecutive_publish_failures}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Connected</dt>
          <dd>{new Date(site.created_at).toLocaleDateString()}</dd>
        </div>
      </dl>

      {canManage && (
        <div className="flex flex-col gap-6">
          {site.cms_type === "wordpress" && (
            <ConnectWordPressForm siteConnectionId={site.id} />
          )}
          <EditSiteForm site={site} />
          <DeleteSiteButton id={site.id} />
        </div>
      )}
    </div>
  );
};

export default SiteDetailPage;
