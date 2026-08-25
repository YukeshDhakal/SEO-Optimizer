import { createClient } from "@repo/auth/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../lib/organization";
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
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="font-semibold text-2xl">
        Generate post — {site.display_name}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Research, draft, and SEO/GEO-optimize a post
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GeneratePostForm siteConnectionId={id} />
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratePage;
