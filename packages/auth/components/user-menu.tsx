"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../provider";

// Minimal Clerk `UserButton` replacement — shows the signed-in user's email
// and a sign-out action. No @repo/design-system import (see sign-in.tsx for
// why); a real avatar/dropdown menu can layer @repo/design-system back on
// top of this once Phase 1's user-profile data exists.
export const UserMenu = () => {
  const router = useRouter();
  const { supabase, user, isLoaded } = useAuth();

  if (!isLoaded || !user) {
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <div className="flex w-full items-center justify-between gap-2 overflow-hidden">
      <Link
        className="truncate text-sm hover:underline"
        href="/account"
        title="Account settings"
      >
        {user.email}
      </Link>
      <button
        className="shrink-0 text-muted-foreground text-xs hover:text-foreground"
        onClick={handleSignOut}
        type="button"
      >
        Sign out
      </button>
    </div>
  );
};
