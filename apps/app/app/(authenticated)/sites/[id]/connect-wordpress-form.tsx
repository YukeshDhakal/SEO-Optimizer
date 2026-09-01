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
import { useActionState } from "react";
import {
  type ConnectWordPressState,
  connectWordPressSite,
} from "../../../actions/site-connections/credentials";

const initialState: ConnectWordPressState = {};

interface ConnectWordPressFormProperties {
  readonly siteConnectionId: string;
}

export const ConnectWordPressForm = ({
  siteConnectionId,
}: ConnectWordPressFormProperties) => {
  const [state, formAction, isPending] = useActionState(
    connectWordPressSite,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect WordPress</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input
            name="site_connection_id"
            type="hidden"
            value={siteConnectionId}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="application_password">
              Application password
            </Label>
            <Input
              id="application_password"
              name="application_password"
              required
              type="password"
            />
            <p className="text-muted-foreground text-xs">
              Generate one under WordPress Admin → Users → Profile →
              Application Passwords — not your account login password.
            </p>
          </div>
          {state.error && (
            <p className="font-medium text-destructive text-sm">{state.error}</p>
          )}
          {state.success && (
            <p className="font-bold text-sm text-status-success-fg">
              Connected.
            </p>
          )}
          <Button className="self-start" disabled={isPending} type="submit">
            {isPending ? "Testing…" : "Test & save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
