"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useState, useTransition } from "react";
import { resolveApproval } from "../../../../../actions/pipeline/approve";

interface ApprovalActionsProperties {
  readonly runId: string;
  readonly siteConnectionId: string;
}

// Shown only when a run is suspended at `approval_gate` (see the parent
// page's status check) — resolves the workflow's `createHook()` suspend via
// `resolveApproval`'s `resumeHook()` call. `router.refresh()` isn't needed:
// `resolveApproval` already calls `revalidatePath` on this exact route.
export const ApprovalActions = ({
  runId,
  siteConnectionId,
}: ApprovalActionsProperties) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  const resolve = (approved: boolean) => {
    startTransition(async () => {
      const result = await resolveApproval(runId, siteConnectionId, approved);
      setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          disabled={isPending}
          onClick={() => resolve(true)}
          size="sm"
        >
          Approve
        </Button>
        <Button
          disabled={isPending}
          onClick={() => resolve(false)}
          size="sm"
          variant="destructive"
        >
          Reject
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
};
