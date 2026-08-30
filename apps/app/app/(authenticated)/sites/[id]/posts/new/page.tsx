import { createClient } from "@repo/auth/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../../lib/organization";
import { SiteTabs } from "../../site-tabs";
import { NewPostForm } from "../new-post-form";

export const metadata: Metadata = {
  title: "New post",
};

interface NewPostPageProperties {
  readonly params: Promise<{ id: string }>;
}

const NewPostPage = async ({ params }: NewPostPageProperties) => {
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

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Publish now
        </h1>
        <p className="mt-1 max-w-xl text-muted-foreground text-sm">
          Write it yourself and push it straight to {site.display_name}.
          This skips the agent entirely, so no quality gate and no policy
          check.
        </p>
      </div>

      <SiteTabs siteId={id} />

      <div className="rounded-md border bg-card p-5">
        <NewPostForm siteConnectionId={id} />
      </div>
    </div>
  );
};

export default NewPostPage;
