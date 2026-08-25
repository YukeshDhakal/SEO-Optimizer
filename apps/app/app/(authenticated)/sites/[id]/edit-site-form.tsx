"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import type { Tables } from "@repo/database";
import { useActionState } from "react";
import {
  type UpdateSiteConnectionState,
  updateSiteConnection,
} from "../../../actions/site-connections/mutate";

const initialState: UpdateSiteConnectionState = {};

interface EditSiteFormProperties {
  readonly site: Tables<"site_connections">;
}

export const EditSiteForm = ({ site }: EditSiteFormProperties) => {
  const [state, formAction, isPending] = useActionState(
    updateSiteConnection,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input name="id" type="hidden" value={site.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="display_name">Name</Label>
            <Input
              defaultValue={site.display_name}
              id="display_name"
              name="display_name"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="base_url">Site URL</Label>
            <Input
              defaultValue={site.base_url ?? ""}
              id="base_url"
              name="base_url"
              type="url"
            />
          </div>
          {state.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}
          <Button className="self-start" disabled={isPending} type="submit">
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
