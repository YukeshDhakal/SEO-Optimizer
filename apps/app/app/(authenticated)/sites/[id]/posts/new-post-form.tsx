"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useActionState } from "react";
import { type PublishPostState, publishPost } from "../../../../actions/posts/publish";

const initialState: PublishPostState = {};

interface NewPostFormProperties {
  readonly siteConnectionId: string;
}

// Plain title/slug/HTML-textarea/meta fields — proving the publish path
// works end-to-end (Phase 2), not a content-editing product. A rich editor
// and AI-generated content are later phases.
export const NewPostForm = ({ siteConnectionId }: NewPostFormProperties) => {
  const [state, formAction, isPending] = useActionState(
    publishPost,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="site_connection_id" type="hidden" value={siteConnectionId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" placeholder="my-first-post" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="content_html">Content (HTML)</Label>
        <Textarea
          className="min-h-40"
          id="content_html"
          name="content_html"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="meta_title">Meta title (optional)</Label>
        <Input id="meta_title" name="meta_title" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="meta_description">Meta description (optional)</Label>
        <Textarea id="meta_description" name="meta_description" />
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button className="self-start" disabled={isPending} type="submit">
        {isPending ? "Publishing…" : "Publish now"}
      </Button>
    </form>
  );
};
