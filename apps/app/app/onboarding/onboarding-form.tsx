"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useActionState } from "react";
import {
  type CreateOrganizationState,
  createOrganization,
} from "../actions/organizations/create";

const initialState: CreateOrganizationState = {};

export const OnboardingForm = () => {
  const [state, formAction, isPending] = useActionState(
    createOrganization,
    initialState
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          Every site you connect and every post the agent publishes belongs
          to an organization. You can invite teammates to it later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Organization name</Label>
            <Input
              autoComplete="organization"
              id="name"
              name="name"
              placeholder="Acme Inc"
              required
            />
          </div>
          {state.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}
          <Button disabled={isPending} type="submit">
            {isPending ? "Creating…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
