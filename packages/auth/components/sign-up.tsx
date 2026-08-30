"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "../client";
import { GoogleGlyph } from "./google-glyph";

// See sign-in.tsx for why this deliberately avoids @repo/design-system.
interface SignUpProps {
  readonly nextUrl?: string;
}

export const SignUp = ({ nextUrl = "/" }: SignUpProps) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  // See sign-in.tsx's handleGoogleSignIn for the full round-trip
  // explanation. Sign-up and sign-in use the same OAuth call - Supabase
  // creates the account on first Google sign-in automatically, there's
  // no separate "sign up with Google" API.
  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSubmitting(true);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`,
      },
    });

    if (oauthError) {
      setIsGoogleSubmitting(false);
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
    <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-semibold text-lg">Create an account</h1>
        <p className="text-muted-foreground text-sm">
          Enter your details to get started.
        </p>
      </div>
      <button
        className="mb-4 flex h-9 w-full items-center justify-center gap-2 rounded-md border bg-background px-4 font-medium text-sm disabled:opacity-50"
        disabled={isGoogleSubmitting}
        onClick={handleGoogleSignIn}
        type="button"
      >
        <GoogleGlyph />
        {isGoogleSubmitting ? "Redirecting…" : "Continue with Google"}
      </button>
      <div className="mb-4 flex items-center gap-3 text-muted-foreground text-xs">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label className="font-medium text-sm" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="font-medium text-sm" htmlFor="password">
            Password
          </label>
          <input
            autoComplete="new-password"
            className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="password"
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {message && (
          <p className="text-muted-foreground text-sm">{message}</p>
        )}
        <button
          className="h-9 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
};
