"use server";

import { createClient } from "@repo/auth/server";
import { getCmsAdapter } from "@repo/cms-adapters";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../lib/organization";

export interface PublishPostState {
  error?: string;
}

// Proves the end-to-end publish path (Phase 2) — a plain textarea for
// content, no rich editor, no AI. Writes a 'draft' `posts` row first, then
// calls the resolved adapter; the row is updated with the real outcome
// either way, so a failed publish still leaves an honest trail rather than
// silently vanishing.
export const publishPost = async (
  _prevState: PublishPostState,
  formData: FormData
): Promise<PublishPostState> => {
  const siteConnectionId = String(formData.get("site_connection_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const contentHtml = String(formData.get("content_html") ?? "").trim();
  const metaTitle = String(formData.get("meta_title") ?? "").trim();
  const metaDescription = String(formData.get("meta_description") ?? "").trim();

  if (!(siteConnectionId && title && slug && contentHtml)) {
    return { error: "Title, slug, and content are required." };
  }

  const organization = await getCurrentOrganization();
  if (!organization) {
    return { error: "No organization found for your account." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: site } = await supabase
    .from("site_connections")
    .select("*")
    .eq("id", siteConnectionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    return { error: "Site not found." };
  }

  const adapter = getCmsAdapter(site.cms_type);
  if (!adapter) {
    return { error: `No adapter registered for "${site.cms_type}".` };
  }

  const { data: draft, error: insertError } = await supabase
    .from("posts")
    .insert({
      organization_id: organization.id,
      site_connection_id: siteConnectionId,
      title,
      slug,
      content_html: contentHtml,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !draft) {
    return {
      error:
        insertError?.code === "23505"
          ? "A post with that slug already exists on this site."
          : "Couldn't create the post. Please try again.",
    };
  }

  let credentials: Record<string, string> | null = null;
  if (site.cms_type !== "hosted_blog") {
    const { data: secret } = await supabase.rpc("get_site_credentials", {
      p_site_connection_id: siteConnectionId,
    });
    credentials = (secret as Record<string, string> | null) ?? null;
  }

  try {
    const result = await adapter.publishPost(
      {
        siteConnectionId,
        organizationSlug: organization.slug,
        baseUrl: site.base_url,
        credentials,
      },
      { title, slug, contentHtml, metaTitle, metaDescription }
    );

    await supabase
      .from("posts")
      .update({
        status: "published",
        external_post_id: result.externalPostId,
        published_url: result.publishedUrl,
        published_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    await supabase
      .from("site_connections")
      .update({ consecutive_publish_failures: 0 })
      .eq("id", siteConnectionId);
  } catch (error) {
    await supabase
      .from("posts")
      .update({ status: "failed" })
      .eq("id", draft.id);

    await supabase
      .from("site_connections")
      .update({
        consecutive_publish_failures: site.consecutive_publish_failures + 1,
      })
      .eq("id", siteConnectionId);

    return {
      error:
        error instanceof Error ? error.message : "Publishing failed.",
    };
  }

  revalidatePath(`/sites/${siteConnectionId}`);
  revalidatePath(`/sites/${siteConnectionId}/posts`);
  redirect(`/sites/${siteConnectionId}/posts`);
};
