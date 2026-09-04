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

// Real production endpoint, not a placeholder — this block is meant to be
// copy-pasted straight into a client's MCP config, bearer token swapped in.
const CONFIG_SNIPPET = `"quillrun": {
  "url": "https://quillrun-api.vercel.app/mcp",
  "headers": { "Authorization": "Bearer <your-key>" }
}`;

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
                Shown once. Quillrun cannot display it again after this dialog
                closes.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 border-[3px] border-foreground bg-status-warning-bg px-3 py-2.5 text-status-warning-fg">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center border-2 border-foreground bg-destructive font-display text-destructive-foreground text-xs">
                  !
                </span>
                <span className="font-medium text-sm">
                  This is the only time the full key is shown. Quillrun stores a
                  hash, not the key — once you close this dialog it can never be
                  retrieved. Copy it into your client now.
                </span>
              </div>
              <div className="flex gap-0 border-[3px] border-foreground bg-foreground">
                <code className="flex-1 overflow-x-auto whitespace-nowrap px-3 py-3 font-mono text-status-success-bg text-xs">
                  {revealed}
                </code>
                <Button
                  className="rounded-none border-0 border-foreground border-l-[3px]"
                  onClick={copy}
                  type="button"
                  variant="accent"
                >
                  Copy
                </Button>
              </div>
              <div className="flex flex-col gap-1.5 border-[3px] border-foreground bg-card px-3 py-2.5">
                <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                  Add to your MCP client config
                </span>
                <code className="whitespace-pre font-mono text-muted-foreground text-xs leading-relaxed">
                  {CONFIG_SNIPPET}
                </code>
              </div>
              <label className="flex items-start gap-3 border-[3px] border-foreground bg-card px-3 py-2.5 text-sm">
                <input
                  checked={acknowledged}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                <span className="font-bold">
                  I&apos;ve saved this key somewhere safe. I understand it
                  can&apos;t be shown again.
                </span>
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
