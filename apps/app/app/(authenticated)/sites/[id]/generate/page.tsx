import { createClient } from "@repo/auth/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../lib/organization";
import { SiteTabs } from "../site-tabs";
import { GeneratePostForm } from "./generate-post-form";

export const metadata: Metadata = {
  title: "Generate post",
};

interface GeneratePageProperties {
  readonly params: Promise<{ id: string }>;
}

const GeneratePage = async ({ params }: GeneratePageProperties) => {
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
        <h1 className="font-display text-3xl tracking-tight">GENERATE A POST</h1>
        <p className="mt-1 max-w-xl text-muted-foreground text-sm">
          Give the agent a topic or keyword. It researches, outlines,
          drafts, then has to pass a quality gate and a policy check before
          anything reaches {site.display_name}.
        </p>
      </div>

      <SiteTabs siteId={id} />

      <div className="border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111]">
        <GeneratePostForm siteConnectionId={id} />
      </div>
    </div>
  );
};

export default GeneratePage;
