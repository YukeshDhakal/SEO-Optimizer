import { getCmsAdapter } from "@repo/cms-adapters";
import { database } from "@repo/database";
import { checkKillSwitch, writeAuditLog } from "@repo/workflows";
import {
  badRequest,
  conflict,
  isAuthorized,
  loadOrganization,
  loadSiteForOrg,
  notFound,
  readJsonBody,
  resolveAuditActorId,
  resolveAuditSource,
  serverError,
  stringField,
  unauthorized,
} from "../_lib/internal-auth";

interface PostRow {
  content_html: string;
  id: string;
  meta_description: string | null;
  meta_title: string | null;
  site_connection_id: string;
  slug: string;
  status: string;
  title: string;
}

// MCP tool: `publish_post`.
//
// Mirrors `apps/app/app/actions/posts/publish.ts`'s publish half exactly: the
// same `getCmsAdapter(site.cms_type)` resolution, the same `adapter.publishPost`
// call shape, the same kill-switch re-check immediately before it, and the same
// four things written afterwards — the post row's
// status/external_post_id/published_url/published_at, the site's
// `consecutive_publish_failures` reset (or increment, on failure), and the
// matching audit entries including the auto-pause receipt at three failures.
//
// The deliberate difference: the server action creates the draft it publishes
// from submitted form fields, because a human is typing an article into a
// textarea. This route publishes an *existing* post by id — the drafts Quillrun's
// own pipeline produced. Letting an external AI agent POST arbitrary HTML
// straight through to a tenant's live CMS would bypass every content gate the
// pipeline runs (guidelines, policy, duplicate, keyword volume), which is the
// opposite of what this connector is for.
export const POST = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const body = await readJsonBody(request);
  if (!body) {
    return badRequest("A JSON object body is required.");
  }

  const organizationId = stringField(body, "organizationId");
  const postId = stringField(body, "postId");

  if (!(organizationId && postId)) {
    return badRequest("organizationId and postId are required.");
  }

  const organization = await loadOrganization(organizationId);
  if (!organization) {
    return notFound("Organization not found.");
  }

  const { data: post, error: postError } = await database
    .from("posts")
    .select(
      "id, site_connection_id, title, slug, status, content_html, meta_title, meta_description"
    )
    .eq("id", postId)
    .eq("organization_id", organizationId)
    .maybeSingle<PostRow>();

  if (postError) {
    return serverError(postError.message);
  }
  if (!post) {
    return notFound("Post not found for this organization.");
  }
  if (post.status === "published") {
    return conflict("That post is already published.", {
      postId: post.id,
      status: post.status,
    });
  }

  const site = await loadSiteForOrg(post.site_connection_id, organizationId);
  if (!site) {
    return notFound("Site not found for this organization.");
  }

  const adapter = getCmsAdapter(site.cms_type);
  if (!adapter) {
    return badRequest(`No adapter registered for "${site.cms_type}".`);
  }

  // Re-checked immediately before the real publish call, exactly as the server
  // action does — closes the race where a tenant/site gets paused (or the
  // emergency stop flips) between the MCP client deciding to publish and this
  // handler running.
  //
  // Unlike the server action, a block here leaves the post row alone. That
  // action marks its draft 'failed' because the draft only existed for that one
  // submission; this post is a real pipeline output that is still a perfectly
  // good draft, and burning it because publishing was momentarily paused would
  // destroy work rather than protect it.
  const killSwitch = await checkKillSwitch(organizationId, site.id);
  if (killSwitch.blocked) {
    await writeAuditLog({
      organizationId,
      actor: resolveAuditActorId(request),
      action: "publish.blocked.kill_switch",
      entityType: "post",
      entityId: post.id,
      metadata: {
        source: resolveAuditSource(request),
        reason: killSwitch.reason,
        siteConnectionId: site.id,
      },
    });
    return conflict(killSwitch.reason ?? "Publishing is currently paused.");
  }

  // The server action fetches CMS credentials through the `get_site_credentials`
  // RPC, which raises unless `is_org_admin_for_site()` passes — i.e. it requires
  // a real signed-in admin. This route runs on the service-role client, where
  // `auth.uid()` is null, so that RPC is unavailable to it by design. Search
  // Console hit the same wall in Phase 7 and solved it with a separate
  // service-role-only `..._for_sync` RPC; the CMS credentials have no such
  // counterpart yet, and adding one is a migration this phase does not write.
  //
  // `hosted_blog` needs no credentials at all (it just computes the public URL),
  // so it works end-to-end today; every other CMS type gets an explicit, honest
  // 501 rather than a confusing adapter error.
  if (site.cms_type !== "hosted_blog") {
    return Response.json(
      {
        error: `Publishing a "${site.cms_type}" site is not available over the internal API yet: its CMS credentials can only be decrypted by a signed-in admin (the get_site_credentials RPC is not granted to service_role). Publish this post from the dashboard, or add a service-role get_site_credentials_for_sync RPC mirroring get_search_console_credentials_for_sync.`,
        postId: post.id,
        cmsType: site.cms_type,
      },
      { status: 501 }
    );
  }

  try {
    const result = await adapter.publishPost(
      {
        siteConnectionId: site.id,
        organizationSlug: organization.slug,
        baseUrl: site.base_url,
        credentials: null,
      },
      {
        title: post.title,
        slug: post.slug,
        contentHtml: post.content_html,
        metaTitle: post.meta_title ?? "",
        metaDescription: post.meta_description ?? "",
      }
    );

    await database
      .from("posts")
      .update({
        status: "published",
        external_post_id: result.externalPostId,
        published_url: result.publishedUrl,
        published_at: new Date().toISOString(),
      })
      .eq("id", post.id);

    await database
      .from("site_connections")
      .update({ consecutive_publish_failures: 0 })
      .eq("id", site.id);

    await writeAuditLog({
      organizationId,
      actor: resolveAuditActorId(request),
      action: "post.published",
      entityType: "post",
      entityId: post.id,
      metadata: {
        source: resolveAuditSource(request),
        siteConnectionId: site.id,
        publishedUrl: result.publishedUrl,
      },
    });

    return Response.json({
      status: "published",
      postId: post.id,
      siteConnectionId: site.id,
      externalPostId: result.externalPostId,
      publishedUrl: result.publishedUrl,
    });
  } catch (publishError) {
    await database.from("posts").update({ status: "failed" }).eq("id", post.id);

    // The trigger on site_connections (auto_pause_site_on_repeated_failures)
    // flips `paused` itself once this update crosses 3 — nothing here needs to
    // check the threshold, only to record the receipt for it below.
    const failures = site.consecutive_publish_failures + 1;
    await database
      .from("site_connections")
      .update({ consecutive_publish_failures: failures })
      .eq("id", site.id);

    const message =
      publishError instanceof Error
        ? publishError.message
        : "Publishing failed.";

    await writeAuditLog({
      organizationId,
      actor: resolveAuditActorId(request),
      action: "post.publish_failed",
      entityType: "post",
      entityId: post.id,
      metadata: {
        source: resolveAuditSource(request),
        siteConnectionId: site.id,
        error: message,
      },
    });

    // Left without a `source` deliberately: this entry records what the
    // database trigger did (auto-pausing the site at three failures), not what
    // the caller asked for, and its metadata shape is asserted exactly in
    // internal-routes.test.ts. `actor` still resolves, so a customer's own
    // auto-pause is still attributed to them.
    if (failures >= 3) {
      await writeAuditLog({
        organizationId,
        actor: resolveAuditActorId(request),
        action: "site.auto_paused",
        entityType: "site_connection",
        entityId: site.id,
        metadata: { consecutiveFailures: failures },
      });
    }

    return serverError(message);
  }
};
