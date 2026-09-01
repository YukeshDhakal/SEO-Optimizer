import { createClient } from "@repo/auth/server";
import { StatusPill } from "@repo/design-system/components/status-pill";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../lib/organization";
import { NewSiteForm } from "./new-site-form";
import { PauseToggleButton } from "./pause-toggle-button";

export const metadata: Metadata = {
  title: "Sites",
};

const sitePillStatus = (site: {
  status: string;
  paused: boolean;
  consecutive_publish_failures: number;
}) => {
  if (site.paused) {
    return "paused" as const;
  }
  if (site.status === "error" || site.consecutive_publish_failures >= 3) {
    return "failed" as const;
  }
  if (site.status === "connected") {
    return "ok" as const;
  }
  return "await" as const;
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

  const pausedCount = (sites ?? []).filter((s) => s.paused).length;
  const summary =
    sites && sites.length > 0
      ? `${sites.length} connected${
          pausedCount > 0 ? ` · ${pausedCount} paused` : ""
        }`
      : "No sites connected yet.";

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">SITES</h1>
          <p className="mt-1 text-muted-foreground text-sm">{summary}</p>
        </div>
      </div>

      {canManage && <NewSiteForm />}

      {sites && sites.length > 0 ? (
        <div className="overflow-x-auto border-[3px] border-foreground">
          <table className="w-full text-sm">
            <thead className="border-foreground border-b-[3px] bg-muted text-left font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">CMS</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Failures</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  className="border-foreground border-b-2 transition-colors last:border-b-0 hover:bg-accent/30"
                  key={site.id}
                >
                  <td className="px-4 py-3.5">
                    <Link
                      className="font-bold hover:text-primary"
                      href={`/sites/${site.id}`}
                    >
                      {site.display_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-muted-foreground">
                    {site.cms_type}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusPill status={sitePillStatus(site)} />
                  </td>
                  <td className="px-4 py-3.5 font-mono text-muted-foreground text-xs">
                    {site.consecutive_publish_failures > 0 ? (
                      <span className="text-status-error-fg">
                        {site.consecutive_publish_failures}
                      </span>
                    ) : (
                      site.consecutive_publish_failures
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3.5 text-right">
                      <PauseToggleButton
                        id={site.id}
                        organizationId={organization.id}
                        paused={site.paused}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-[3px] border-foreground border-dashed p-9 text-center">
          <p className="font-display text-lg tracking-tight">
            NO SITES CONNECTED YET
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-muted-foreground text-sm">
            Connect a WordPress site, or start a hosted blog we run for you.
            The agent stays idle until a site exists.
          </p>
        </div>
      )}
    </div>
  );
};

export default SitesPage;
