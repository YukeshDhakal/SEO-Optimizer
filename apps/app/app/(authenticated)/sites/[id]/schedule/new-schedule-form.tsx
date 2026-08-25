"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useActionState } from "react";
import {
  type ScheduleFormState,
  createSchedule,
} from "../../../../actions/schedules/mutate";

const initialState: ScheduleFormState = {};

interface NewScheduleFormProperties {
  readonly siteConnectionId: string;
  readonly organizationId: string;
}

export const NewScheduleForm = ({
  siteConnectionId,
  organizationId,
}: NewScheduleFormProperties) => {
  const [state, formAction, isPending] = useActionState(
    createSchedule,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="site_connection_id" type="hidden" value={siteConnectionId} />
      <input name="organization_id" type="hidden" value={organizationId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="cadence">Cadence (cron expression)</Label>
        <Input
          id="cadence"
          name="cadence"
          placeholder="0 9 * * 1 (every Monday at 9am)"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input defaultValue="UTC" id="timezone" name="timezone" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="topic_hint">Topic or niche hint</Label>
        <Input
          id="topic_hint"
          name="topic_hint"
          placeholder="Reused for every run this schedule triggers"
          required
        />
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button className="self-start" disabled={isPending} type="submit">
        {isPending ? "Creating…" : "Create schedule"}
      </Button>
    </form>
  );
};
