"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useActionState } from "react";
import {
  type GeneratePostState,
  generatePost,
} from "../../../../actions/pipeline/generate";

const initialState: GeneratePostState = {};

interface GeneratePostFormProperties {
  readonly siteConnectionId: string;
}

// Manually-triggered. As of Phase 4 this starts a durable Workflow DevKit
// run (crash-resumable, step-cached) rather than Phase 3's plain synchronous
// call, but this form still awaits the full result before redirecting —
// several model calls plus a possible retry loop, so submitting can take a
// while either way.
export const GeneratePostForm = ({
  siteConnectionId,
}: GeneratePostFormProperties) => {
  const [state, formAction, isPending] = useActionState(
    generatePost,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="site_connection_id" type="hidden" value={siteConnectionId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="topic_hint">Topic or niche hint</Label>
        <Input
          id="topic_hint"
          name="topic_hint"
          placeholder="e.g. buying your first home espresso machine"
          required
        />
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button className="self-start" disabled={isPending} type="submit">
        {isPending ? "Generating… (this can take a minute)" : "Generate"}
      </Button>
    </form>
  );
};
