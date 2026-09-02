"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "../client";
import { GitHubGlyph } from "./github-glyph";
import { GoogleGlyph } from "./google-glyph";
import { MicrosoftGlyph } from "./microsoft-glyph";

// See sign-in.tsx for why this deliberately avoids @repo/design-system.
interface SignUpProps {
  readonly nextUrl?: string;
}

const OAUTH_PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleGlyph },
  { id: "github", label: "GitHub", Icon: GitHubGlyph },
  { id: "azure", label: "Microsoft", Icon: MicrosoftGlyph },
] as const;

export const SignUp = ({ nextUrl = "/" }: SignUpProps) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthPending, setOauthPending] = useState<string | null>(null);

  // See sign-in.tsx's handleOAuthSignIn for the full round-trip
  // explanation. Sign-up and sign-in use the same OAuth call - Supabase
  // creates the account on first sign-in automatically, there's no
  // separate "sign up with <provider>" API.
  const handleOAuthSignIn = async (provider: (typeof OAUTH_PROVIDERS)[number]["id"]) => {
    setError(null);
    setOauthPending(provider);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`,
      },
    });

    if (oauthError) {
      setOauthPending(null);
      setError(oauthError.message);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    setIsSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.push(nextUrl);
      router.refresh();
      return;
    }

    // Email confirmation is on by default for a new Supabase project — no
    // session comes back until the user clicks the confirmation link.
    setMessage("Check your email to confirm your account.");
  };

  return (
    <div className="w-full max-w-sm border-[3px] border-foreground bg-card p-6 text-card-foreground shadow-[8px_8px_0_#111]">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-display text-2xl tracking-tight">CREATE AN ACCOUNT</h1>
        <p className="text-muted-foreground text-sm">
          Enter your details to get started.
        </p>
      </div>
      <div className="mb-4 flex flex-col gap-2.5">
        {OAUTH_PROVIDERS.map(({ id, label, Icon }) => (
          <button
            className="flex h-10 w-full items-center justify-center gap-2 border-[3px] border-foreground bg-background px-4 font-bold text-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            disabled={oauthPending !== null}
            key={id}
            onClick={() => handleOAuthSignIn(id)}
            type="button"
          >
            <Icon />
            {oauthPending === id ? "Redirecting…" : `Continue with ${label}`}
          </button>
        ))}
      </div>
      <div className="mb-4 flex items-center gap-3 font-bold text-muted-foreground text-xs">
        <span className="h-0.5 flex-1 bg-foreground" />
        or
        <span className="h-0.5 flex-1 bg-foreground" />
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label className="font-bold text-sm" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="h-10 border-[3px] border-foreground bg-input px-3 text-sm outline-none focus-visible:shadow-[4px_4px_0_#2B44FF]"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="font-bold text-sm" htmlFor="password">
            Password
          </label>
          <input
            autoComplete="new-password"
            className="h-10 border-[3px] border-foreground bg-input px-3 text-sm outline-none focus-visible:shadow-[4px_4px_0_#2B44FF]"
            id="password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <p className="text-[11px] text-muted-foreground">
            At least 8 characters.
          </p>
        </div>
        {error && <p className="font-medium text-destructive text-sm">{error}</p>}
        {message && (
          <p className="font-medium text-muted-foreground text-sm">{message}</p>
        )}
        <button
          className="h-10 border-[3px] border-foreground bg-primary px-4 font-bold text-primary-foreground text-sm shadow-[4px_4px_0_#111] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#111] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#111] disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        Already have an account?{" "}
        <Link
          className="font-bold underline hover:text-primary"
          href={`/sign-in${nextUrl && nextUrl !== "/" ? `?next=${encodeURIComponent(nextUrl)}` : ""}`}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
};
