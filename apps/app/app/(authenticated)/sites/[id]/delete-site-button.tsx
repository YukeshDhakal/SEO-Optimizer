import { Button } from "@repo/design-system/components/ui/button";
import { deleteSiteConnection } from "../../../actions/site-connections/mutate";

interface DeleteSiteButtonProperties {
  readonly id: string;
}

export const DeleteSiteButton = ({ id }: DeleteSiteButtonProperties) => (
  <form action={deleteSiteConnection}>
    <input name="id" type="hidden" value={id} />
    <Button type="submit" variant="destructive">
      Delete site
    </Button>
  </form>
);
