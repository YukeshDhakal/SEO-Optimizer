import { createClient } from "@repo/auth/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../../lib/organization";
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
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="font-semibold text-2xl">
        New post — {site.display_name}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publish now</CardTitle>
        </CardHeader>
        <CardContent>
          <NewPostForm siteConnectionId={id} />
        </CardContent>
      </Card>
    </div>
  );
};

export default NewPostPage;
