"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "../client";
import { GoogleGlyph } from "./google-glyph";

// Deliberately no @repo/design-system import here — that package's own
// provider (DesignSystemProvider) imports AuthProvider from this package,
// so depending back on @repo/design-system would create a circular
// workspace dependency. Plain elements + the app's existing Tailwind/shadcn
// utility classes instead.
interface SignInProps {
  readonly nextUrl?: string;
}

export const SignIn = ({ nextUrl = "/" }: SignInProps) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push(nextUrl);
    router.refresh();
  };

  // Redirects to Google, which sends the browser to Supabase's own
  // hosted OAuth callback, which then redirects here to
  // /auth/callback?next=... to finish the session exchange. Errors out
  // with Supabase's own message if the Google provider isn't enabled in
  // the Supabase dashboard yet - degrades the same way every other
  // not-yet-configured integration in this codebase does, rather than
  // hiding the button.
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
    // On success the browser navigates away to Google immediately - no
    // further state update needed here.
  };

  return (
    <div className="w-full max-w-sm border-[3px] border-foreground bg-card p-6 text-card-foreground shadow-[8px_8px_0_#111]">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-display text-2xl tracking-tight">SIGN IN</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and password to continue.
        </p>
      </div>
      <button
        className="mb-4 flex h-10 w-full items-center justify-center gap-2 border-[3px] border-foreground bg-background px-4 font-bold text-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        disabled={isGoogleSubmitting}
        onClick={handleGoogleSignIn}
        type="button"
      >
        <GoogleGlyph />
        {isGoogleSubmitting ? "Redirecting…" : "Continue with Google"}
      </button>
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
            autoComplete="current-password"
            className="h-10 border-[3px] border-foreground bg-input px-3 text-sm outline-none focus-visible:shadow-[4px_4px_0_#2B44FF]"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        {error && <p className="font-medium text-destructive text-sm">{error}</p>}
        <button
          className="h-10 border-[3px] border-foreground bg-primary px-4 font-bold text-primary-foreground text-sm shadow-[4px_4px_0_#111] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#111] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#111] disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link
          className="font-bold underline hover:text-primary"
          href={`/sign-up${nextUrl && nextUrl !== "/" ? `?next=${encodeURIComponent(nextUrl)}` : ""}`}
        >
          Sign up
        </Link>
      </p>
    </div>
  );
};
