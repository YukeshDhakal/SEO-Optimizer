"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { revokeApiKey } from "../../../actions/api-keys/mutate";

interface RevokeKeyButtonProperties {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
}

// Confirmed rather than one-click: revocation takes effect on the very next
// request from whatever AI client holds this key, and it cannot be undone —
// the only recovery is issuing a new key and re-pasting it into every client.
export const RevokeKeyButton = ({
  id,
  name,
  prefix,
}: RevokeKeyButtonProperties) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button size="sm" variant="outline">
        Revoke
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Revoke “{name}”?</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5 border-[3px] border-foreground bg-card px-3 py-2 text-left">
              <span className="font-bold text-foreground text-sm">{name}</span>
              <span className="font-mono text-muted-foreground text-xs">
                {prefix}…
              </span>
            </div>
            <span>
              Any AI client using this key stops working immediately,
              mid-session included. This can&apos;t be undone — you&apos;ll need
              to create a new key and paste it into each client again. The key
              stays listed here as Revoked for audit history.
            </span>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <form action={revokeApiKey}>
          <input name="id" type="hidden" value={id} />
          <AlertDialogAction type="submit">Revoke key</AlertDialogAction>
        </form>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
