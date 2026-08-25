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

// Manually-triggered (Phase 3) — no scheduling/cron yet (Phase 4). Submitting
// runs the whole pipeline synchronously in this one request, so this can take
// a while (several model calls, one retry loop) before the redirect to the
// run status page lands.
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
