"use client";

import { createClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteAccount } from "../../actions/account/delete-account";

const CONFIRM_PHRASE = "DELETE";

// Inline type-to-confirm rather than a modal - matches this page's
// existing pattern of plain bordered boxes with conditional inner state
// (identity-manager.tsx), and avoids Radix AlertDialog's auto-close-on-
// click behavior fighting an async action that can fail and needs to
// stay open with the error visible. The actual delete runs server-side
// (delete-account.ts) since it needs the service-role client.
export const DeleteAccountPanel = () => {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    const result = await deleteAccount();
    if (!result.success) {
      setDeleting(false);
      setError(result.error ?? "Couldn't delete your account.");
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <div className="border-[3px] border-destructive bg-card p-5 shadow-[6px_6px_0_#111]">
      <h2 className="font-display text-destructive text-lg tracking-tight">
        DELETE ACCOUNT
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Permanently deletes your account and sign-in credentials. If you
        solely own an organization, that organization and all of its sites,
        runs, and posts are deleted too. This cannot be undone.
      </p>

      {!confirming && (
        <Button
          className="mt-4"
          onClick={() => setConfirming(true)}
          type="button"
          variant="destructive"
        >
          Delete account
        </Button>
      )}

      {confirming && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-confirm">
              Type {CONFIRM_PHRASE} to confirm
            </Label>
            <Input
              autoComplete="off"
              id="delete-confirm"
              onChange={(event) => setPhrase(event.target.value)}
              value={phrase}
            />
          </div>
          <div className="flex gap-2">
            <Button
              disabled={phrase !== CONFIRM_PHRASE || deleting}
              onClick={handleDelete}
              type="button"
              variant="destructive"
            >
              {deleting ? "Deleting…" : "Permanently delete"}
            </Button>
            <Button
              disabled={deleting}
              onClick={() => {
                setConfirming(false);
                setPhrase("");
                setError(null);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 font-medium text-destructive text-sm">{error}</p>}
    </div>
  );
};
