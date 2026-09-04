"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  type ApiKeyFormState,
  createApiKey,
} from "../../../actions/api-keys/mutate";

const initialState: ApiKeyFormState = {};

interface CreateApiKeyDialogProperties {
  readonly organizationId: string;
}

// Two-phase dialog. Phase 1 collects a name and an optional cap; phase 2 shows
// the generated secret exactly once. The secret is never persisted — only its
// sha-256 hash and a 12-character display prefix are — so this render is the
// only opportunity the user will ever have to copy it. That is why closing is
// gated on an explicit acknowledgement rather than the usual overlay click.
export const CreateApiKeyDialog = ({
  organizationId,
}: CreateApiKeyDialogProperties) => {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createApiKey,
    initialState
  );

  const revealed = state.plaintextKey;

  const copy = async () => {
    if (!revealed) {
      return;
    }
    try {
      await navigator.clipboard.writeText(revealed);
      toast.success("Key copied to clipboard.");
    } catch {
      // Clipboard access is blocked in some browsers/contexts (notably a
      // non-secure origin). The key is already selectable in the field above,
      // so say so rather than failing silently.
      toast.error("Couldn't copy automatically — select the key and copy it.");
    }
  };

  // Reset back to phase 1 on close, so reopening the dialog doesn't re-reveal
  // a key the user has already acknowledged saving.
  const handleOpenChange = (next: boolean) => {
    if (!next && revealed && !acknowledged) {
      return;
    }
    setOpen(next);
    if (!next) {
      setAcknowledged(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">New key</Button>
      </DialogTrigger>
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (revealed && !acknowledged) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (revealed && !acknowledged) {
            event.preventDefault();
          }
        }}
        showCloseButton={!revealed || acknowledged}
      >
        {revealed ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your key now</DialogTitle>
              <DialogDescription>
                This is the only time this key will ever be shown. Quillrun
                stores only a hash of it — if you lose it, revoke this key and
                create another.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input
                  className="font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={revealed}
                />
                <Button onClick={copy} type="button" variant="outline">
                  Copy
                </Button>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  checked={acknowledged}
                  className="mt-0.5 size-4 accent-primary"
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                <span>I&apos;ve saved this key somewhere safe.</span>
              </label>
            </div>
            <DialogFooter>
              <Button
                disabled={!acknowledged}
                onClick={() => handleOpenChange(false)}
                type="button"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                Give an AI client access to this organization&apos;s Quillrun
                data over MCP. The key is scoped to this organization only.
              </DialogDescription>
            </DialogHeader>
            <input
              name="organization_id"
              type="hidden"
              value={organizationId}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Claude Desktop — laptop"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="monthly_call_limit">
                Monthly call limit (optional)
              </Label>
              <Input
                id="monthly_call_limit"
                min="1"
                name="monthly_call_limit"
                placeholder="Leave empty for unlimited"
                type="number"
              />
              <p className="text-muted-foreground text-xs">
                Every request this key makes counts toward the limit, reads
                included. Once it&apos;s reached, calls are refused until the
                first of next month. You can change this later.
              </p>
            </div>
            {state.error && (
              <p className="text-destructive text-sm">{state.error}</p>
            )}
            <DialogFooter>
              <Button disabled={isPending} type="submit">
                {isPending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
