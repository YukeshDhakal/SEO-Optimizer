import { Button } from "@repo/design-system/components/ui/button";
import { toggleSitePaused } from "../../actions/site-connections/mutate";

interface PauseToggleButtonProperties {
  readonly id: string;
  readonly paused: boolean;
  readonly organizationId: string;
}

// Plain server-action-bound form — no client JS needed for this.
export const PauseToggleButton = ({
  id,
  paused,
  organizationId,
}: PauseToggleButtonProperties) => (
  <form action={toggleSitePaused} className="inline-block">
    <input name="id" type="hidden" value={id} />
    <input name="paused" type="hidden" value={String(paused)} />
    <input name="organization_id" type="hidden" value={organizationId} />
    <Button size="sm" type="submit" variant="outline">
      {paused ? "Resume" : "Pause"}
    </Button>
  </form>
);
