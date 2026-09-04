"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { useActionState, useState } from "react";
import {
  type GeneratePostState,
  generatePost,
} from "../../../../actions/pipeline/generate";

const initialState: GeneratePostState = {};

interface GeneratePostFormProperties {
  readonly siteConnectionId: string;
}

const CONTENT_TYPES = [
  {
    id: "blog" as const,
    label: "Blog post",
    detail:
      "Standard article — direct-answer opener, subtopic sections, FAQ block",
  },
  {
    id: "faq" as const,
    label: "FAQ",
    detail:
      "FAQ-first page — short context, then a full set of real-demand Q&As",
  },
];

// Manually-triggered. As of Phase 4 this starts a durable Workflow DevKit
// run (crash-resumable, step-cached) rather than Phase 3's plain synchronous
// call. As of Phase 13, `generatePost` redirects the moment the run
// registers rather than waiting for the whole pipeline — the actual
// multi-minute wait (several model calls, a possible retry loop) now
// happens visibly on the run-detail page's own live timeline, not behind
// this button.
//
// The blog/FAQ toggle below doesn't change which pipeline runs — both
// modes go through the exact same topic_selection → research → outline →
// draft → geo_seo_optimize → policy_check steps. It only changes the
// content_type value those steps' prompts branch on (see @repo/ai-engine's
// content-guidelines.ts), so a "FAQ" run still gets every quality gate a
// blog run does.
export const GeneratePostForm = ({
  siteConnectionId,
}: GeneratePostFormProperties) => {
  const [state, formAction, isPending] = useActionState(
    generatePost,
    initialState
  );
  const [contentType, setContentType] = useState<"blog" | "faq">("blog");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="site_connection_id" type="hidden" value={siteConnectionId} />
      <input name="content_type" type="hidden" value={contentType} />

      <div className="flex flex-col gap-2">
        <Label>Content type</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CONTENT_TYPES.map((type) => (
            <button
              className={cn(
                "flex flex-col gap-1 border-[3px] border-foreground p-3.5 text-left transition-transform hover:-translate-y-0.5",
                contentType === type.id
                  ? "bg-primary text-primary-foreground shadow-[4px_4px_0_#111]"
                  : "bg-background"
              )}
              key={type.id}
              onClick={() => setContentType(type.id)}
              type="button"
            >
              <span className="font-bold text-sm">{type.label}</span>
              <span className="text-xs">{type.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="topic_hint">Topic or niche hint</Label>
        <Input
          id="topic_hint"
          name="topic_hint"
          placeholder="e.g. buying your first home espresso machine"
          required
        />
      </div>
      {state.error && (
        <p className="font-medium text-destructive text-sm">{state.error}</p>
      )}
      <Button className="self-start" disabled={isPending} type="submit">
        {isPending ? "Starting…" : "Generate"}
      </Button>
    </form>
  );
};
