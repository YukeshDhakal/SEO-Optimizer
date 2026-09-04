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
}

// Confirmed rather than one-click: revocation takes effect on the very next
// request from whatever AI client holds this key, and it cannot be undone —
// the only recovery is issuing a new key and re-pasting it into every client.
export const RevokeKeyButton = ({ id, name }: RevokeKeyButtonProperties) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button size="sm" variant="outline">
        Revoke
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Revoke “{name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          Any AI client using this key stops working immediately, mid-session
          included. This can&apos;t be undone — you&apos;ll need to create a new
          key and paste it into each client again.
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
