"use client";

import { createClient, type UserIdentity } from "@repo/auth/client";
import { GitHubGlyph } from "@repo/auth/components/github-glyph";
import { GoogleGlyph } from "@repo/auth/components/google-glyph";
import { MicrosoftGlyph } from "@repo/auth/components/microsoft-glyph";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { logIdentityEvent } from "../../actions/account/log-identity-event";

const OAUTH_PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleGlyph },
  { id: "github", label: "GitHub", Icon: GitHubGlyph },
  { id: "azure", label: "Microsoft", Icon: MicrosoftGlyph },
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email and password",
  google: "Google",
  github: "GitHub",
  azure: "Microsoft",
};

// Manages every sign-in method on the current account: connect/disconnect
// an OAuth provider (supabase.auth.linkIdentity/unlinkIdentity - both need
// "Allow manual linking" on in Supabase Auth settings, enabled 2026-09-02)
// and add/change a password. All of this runs client-side against the
// live session, same as sign-in.tsx/sign-up.tsx - there's no server-action
// equivalent for linkIdentity specifically since it redirects the browser
// to the provider, same as signInWithOAuth. Every successful change is
// logged to audit_log via the log-identity-event server action, matching
// this app's "every control point is legible" posture elsewhere.
export const IdentityManager = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase.auth.getUserIdentities();
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setIdentities(data.identities);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The linkIdentity() OAuth round trip lands back here with ?linked=
  // <provider> (redirectTo below) - there's no other point in the flow to
  // log the audit event from, since linkIdentity() itself never resolves
  // in this tab (the browser navigates away). Strip the param after
  // logging so a refresh doesn't replay it, same pattern as
  // OAuthStatusBanner on the site-detail page.
  useEffect(() => {
    const linked = searchParams.get("linked");
    if (!linked) {
      return;
    }
    logIdentityEvent("account.identity.linked", linked).then(() => refresh());
    const next = new URLSearchParams(searchParams);
    next.delete("linked");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // biome-ignore lint/correctness/useExhaustiveDependencies: only rerun when the linked param itself changes
  }, [searchParams, pathname, router, refresh]);

  const linkedProviderIds = new Set((identities ?? []).map((i) => i.provider));
  const hasPasswordIdentity = linkedProviderIds.has("email");
  const canUnlink = (identities?.length ?? 0) > 1;

  const handleConnect = async (provider: (typeof OAUTH_PROVIDERS)[number]["id"]) => {
    setError(null);
    setPending(provider);
    const supabase = createClient();
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${window.location.origin}/account?linked=${provider}`,
      },
    });
    if (linkError) {
      setPending(null);
      setError(linkError.message);
    }
    // On success the browser navigates away immediately.
  };

  const handleDisconnect = async (identity: UserIdentity) => {
    setError(null);
    setPending(identity.provider);
    const supabase = createClient();
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
    setPending(null);
    if (unlinkError) {
      setError(unlinkError.message);
      return;
    }
    await logIdentityEvent("account.identity.unlinked", identity.provider);
    await refresh();
  };

  const handleSetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPasswordMessage(null);
    setPending("password");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    const wasPasswordIdentity = hasPasswordIdentity;
    await logIdentityEvent(
      wasPasswordIdentity ? "account.password.changed" : "account.password.added",
      "email"
    );
    // Known Supabase rough edge: the identities table doesn't always
    // immediately reflect the newly-added email/password method after
    // updateUser() - refetch and check it actually landed rather than
    // silently assuming the call fully succeeded.
    const supabaseAfter = createClient();
    const { data: after, error: afterError } = await supabaseAfter.auth.getUserIdentities();
    if (!afterError) {
      setIdentities(after.identities);
    }
    if (!wasPasswordIdentity && !after?.identities.some((i) => i.provider === "email")) {
      setPasswordMessage(
        "Password saved, but it isn't showing up as a sign-in method yet — refresh this page to confirm before relying on it."
      );
      return;
    }
    setPasswordMessage(
      wasPasswordIdentity ? "Password updated." : "Password added as a sign-in method."
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111]">
        <h2 className="font-display text-lg tracking-tight">SIGN-IN METHODS</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Everything that can sign you into this account. You always need at
          least one.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {identities === null && (
            <p className="text-muted-foreground text-sm">Loading…</p>
          )}
          {identities?.map((identity) => (
            <div
              className="flex items-center justify-between gap-3 border-[3px] border-foreground bg-background px-3.5 py-3"
              key={identity.identity_id}
            >
              <span className="font-bold text-sm">
                {PROVIDER_LABELS[identity.provider] ?? identity.provider}
              </span>
              <Button
                disabled={!canUnlink || pending === identity.provider}
                onClick={() => handleDisconnect(identity)}
                size="sm"
                title={
                  canUnlink
                    ? undefined
                    : "This is your only sign-in method — add another before disconnecting it."
                }
                type="button"
                variant="outline"
              >
                {pending === identity.provider ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          ))}
          {OAUTH_PROVIDERS.filter(({ id }) => !linkedProviderIds.has(id)).map(
            ({ id, label, Icon }) => (
              <Button
                className="flex w-full items-center justify-center gap-2"
                disabled={pending !== null}
                key={id}
                onClick={() => handleConnect(id)}
                type="button"
                variant="outline"
              >
                <Icon />
                {pending === id ? "Redirecting…" : `Connect ${label}`}
              </Button>
            )
          )}
        </div>
      </div>

      <div className="border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111]">
        <h2 className="font-display text-lg tracking-tight">
          {hasPasswordIdentity ? "CHANGE PASSWORD" : "ADD A PASSWORD"}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {hasPasswordIdentity
            ? "Set a new password for signing in with email."
            : "You currently sign in with an OAuth provider only — add a password as a backup way in."}
        </p>
        <form className="mt-4 flex flex-col gap-3" onSubmit={handleSetPassword}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              autoComplete="new-password"
              id="new-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          <Button className="self-start" disabled={pending === "password"} type="submit">
            {pending === "password"
              ? "Saving…"
              : hasPasswordIdentity
                ? "Update password"
                : "Add password"}
          </Button>
        </form>
        {passwordMessage && (
          <p className="mt-3 font-medium text-sm">{passwordMessage}</p>
        )}
      </div>

      {error && (
        <p className="font-medium text-destructive text-sm">{error}</p>
      )}
    </div>
  );
};
