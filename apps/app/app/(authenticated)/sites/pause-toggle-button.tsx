import { Button } from "@repo/design-system/components/ui/button";
import { toggleSitePaused } from "../../actions/site-connections/mutate";

interface PauseToggleButtonProperties {
  readonly id: string;
  readonly paused: boolean;
}

// Plain server-action-bound form — no client JS needed for this.
export const PauseToggleButton = ({
  id,
  paused,
}: PauseToggleButtonProperties) => (
  <form action={toggleSitePaused} className="inline-block">
    <input name="id" type="hidden" value={id} />
    <input name="paused" type="hidden" value={String(paused)} />
    <Button size="sm" type="submit" variant="outline">
      {paused ? "Resume" : "Pause"}
    </Button>
  </form>
);
