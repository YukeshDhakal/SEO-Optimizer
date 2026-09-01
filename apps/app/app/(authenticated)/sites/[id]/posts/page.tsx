import { createClient } from "@repo/auth/server";
import { StatusPill } from "@repo/design-system/components/status-pill";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../lib/organization";
import { SiteTabs } from "../site-tabs";

export const metadata: Metadata = {
  title: "Posts",
};

interface PostsPageProperties {
  readonly params: Promise<{ id: string }>;
}

const postPillStatus = (status: string) => {
  if (status === "published") {
    return "ok" as const;
  }
  if (status === "failed") {
    return "failed" as const;
  }
  return "draft" as const;
};

const PostsPage = async ({ params }: PostsPageProperties) => {
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

  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("site_connection_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">POSTS</h1>
          <p className="mt-1 max-w-xl text-muted-foreground text-sm">
            Published posts live on your server, not ours. The live link is
            the proof, so open it whenever you want to check the agent's
            work.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`/sites/${id}/posts/new`}>New post</Link>
        </Button>
      </div>

      <SiteTabs siteId={id} />

      {posts && posts.length > 0 ? (
        <div className="overflow-x-auto border-[3px] border-foreground">
          <table className="w-full text-sm">
            <thead className="border-foreground border-b-[3px] bg-muted text-left font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Live URL</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr
                  className="border-foreground border-b-2 transition-colors last:border-b-0 hover:bg-accent/30"
                  key={post.id}
                >
                  <td className="max-w-sm truncate px-4 py-3.5 font-bold">
                    {post.title}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusPill status={postPillStatus(post.status)}>
                      {post.status}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-muted-foreground text-xs">
                    {post.published_at
                      ? new Date(post.published_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    {post.published_url ? (
                      <a
                        className="inline-flex items-center gap-1.5 border-2 border-foreground bg-accent px-2.5 py-1 font-bold font-mono text-xs hover:bg-primary"
                        href={post.published_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {post.published_url.replace(/^https?:\/\//, "")}
                        <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span className="font-mono text-muted-foreground text-xs">
                        not on the site
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No posts yet for this site.
        </p>
      )}
    </div>
  );
};

export default PostsPage;
