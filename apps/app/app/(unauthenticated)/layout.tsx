import { Feather } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { env } from "@/env";

interface AuthLayoutProps {
  readonly children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => (
  <div className="grid h-dvh lg:grid-cols-2">
    <div className="relative hidden flex-col justify-between border-foreground border-r-[3px] bg-foreground p-10 text-background lg:flex">
      <Link
        className="flex w-fit items-center gap-2.5 transition-opacity hover:opacity-80"
        href={env.NEXT_PUBLIC_WEB_URL}
      >
        <Feather aria-hidden="true" className="h-7 w-7 text-primary" strokeWidth={2.25} />
        <span className="font-display text-xl tracking-tight">QUILLRUN</span>
      </Link>
      <blockquote className="space-y-2">
        <p className="font-display text-2xl leading-[1.1] tracking-tight">
          &ldquo;Content automation with visible guardrails, always under your
          control.&rdquo;
        </p>
        <footer className="text-background/60 text-sm">Quillrun</footer>
      </blockquote>
    </div>
    <div className="flex flex-col items-center justify-center gap-6 p-8">
      {/* Dark panel (with its own linked logo) is desktop-only — this is
          the small-screen equivalent so there's always a way back to the
          marketing site, not just on large viewports. */}
      <Link
        className="flex items-center gap-2 lg:hidden"
        href={env.NEXT_PUBLIC_WEB_URL}
      >
        <Feather aria-hidden="true" className="h-6 w-6 text-primary" strokeWidth={2.25} />
        <span className="font-display text-lg tracking-tight">QUILLRUN</span>
      </Link>
      <div className="mx-auto flex w-full max-w-[400px] flex-col justify-center gap-6">
        {children}
      </div>
    </div>
  </div>
);

export default AuthLayout;
