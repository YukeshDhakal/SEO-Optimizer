"use client";

import { CMS_TYPES } from "@repo/cms-adapters";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useActionState, useRef } from "react";
import {
  type CreateSiteConnectionState,
  createSiteConnection,
} from "../../actions/site-connections/create";

// A plain native <select> rather than the design system's Radix-based
// Select — this form posts via a server action, and a native element needs
// no client-side value wiring to submit correctly.
const initialState: CreateSiteConnectionState = {};

export const NewSiteForm = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (
      prevState: CreateSiteConnectionState,
      formData: FormData
    ): Promise<CreateSiteConnectionState> => {
      const result = await createSiteConnection(prevState, formData);
      if (!result.error) {
        formRef.current?.reset();
      }
      return result;
    },
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect a site</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3"
          ref={formRef}
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="display_name">Name</Label>
            <Input
              id="display_name"
              name="display_name"
              placeholder="My blog"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cms_type">CMS</Label>
            <select
              className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={CMS_TYPES[0]}
              id="cms_type"
              name="cms_type"
            >
              {CMS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="base_url">Site URL</Label>
            <Input
              id="base_url"
              name="base_url"
              placeholder="https://example.com"
              type="url"
            />
          </div>
          <Button disabled={isPending} type="submit">
            {isPending ? "Adding…" : "Add site"}
          </Button>
        </form>
        {state.error && (
          <p className="mt-2 text-destructive text-sm">{state.error}</p>
        )}
      </CardContent>
    </Card>
  );
};
