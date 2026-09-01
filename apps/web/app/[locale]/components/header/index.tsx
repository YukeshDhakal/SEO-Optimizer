"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { Dictionary } from "@repo/internationalization";
import { Feather, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";
import { LanguageSwitcher } from "./language-switcher";

interface HeaderProps {
  dictionary: Dictionary;
  locale: string;
}

// Flat nav, no dropdown — matches the neobrutalism handoff's header exactly
// (Home / Pricing / Writing, each a plain link that gets a border+lime
// background on hover, sticky top with a 3px black bottom border). The
// previous header's "Product" dropdown wrapping Pricing is gone; Pricing is
// now a direct top-level link like every other item.
export const Header = ({ dictionary, locale }: HeaderProps) => {
  const navigationItems = [
    { title: dictionary.web.header.home, href: localeHref(locale, "/") },
    { title: dictionary.web.header.product.pricing, href: localeHref(locale, "/pricing") },
    { title: dictionary.web.header.blog, href: localeHref(locale, "/blog") },
    ...(env.NEXT_PUBLIC_DOCS_URL
      ? [{ title: dictionary.web.header.docs, href: env.NEXT_PUBLIC_DOCS_URL }]
      : []),
  ];
  const contactHref = localeHref(locale, "/contact");

  const [isOpen, setOpen] = useState(false);

  return (
    <header className="sticky top-0 left-0 z-40 w-full border-b-[3px] border-foreground bg-background">
      <div className="container mx-auto flex h-[74px] items-center justify-between gap-6 px-4">
        <Link className="flex shrink-0 items-center gap-2.5" href={localeHref(locale, "/")}>
          <Feather aria-hidden="true" className="h-7 w-7 text-primary" strokeWidth={2.25} />
          <span className="font-display whitespace-nowrap text-xl tracking-tight">
            QUILLRUN
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navigationItems.map((item) => (
            <Link
              className="border-[3px] border-transparent px-3.5 py-2 font-bold text-sm transition-colors hover:border-foreground hover:bg-accent"
              href={item.href}
              key={item.title}
              rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
              target={item.href.startsWith("http") ? "_blank" : undefined}
            >
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            className="border-[3px] border-transparent px-3.5 py-2 font-bold text-sm transition-colors hover:border-foreground hover:bg-accent"
            href={contactHref}
          >
            {dictionary.web.header.contact}
          </Link>
          <LanguageSwitcher />
          <Button asChild variant="outline">
            <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-in`}>
              {dictionary.web.header.signIn}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-up`}>
              {dictionary.web.header.signUp}
            </Link>
          </Button>
        </div>

        <Button
          className="lg:hidden"
          onClick={() => setOpen(!isOpen)}
          size="icon"
          variant="outline"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {isOpen && (
        <div
          className={cn(
            "flex flex-col gap-1 border-t-[3px] border-foreground bg-background p-4 lg:hidden"
          )}
        >
          {navigationItems.map((item) => (
            <Link
              className="border-[3px] border-transparent px-3.5 py-2.5 font-bold text-base hover:border-foreground hover:bg-accent"
              href={item.href}
              key={item.title}
            >
              {item.title}
            </Link>
          ))}
          <Link
            className="border-[3px] border-transparent px-3.5 py-2.5 font-bold text-base hover:border-foreground hover:bg-accent"
            href={contactHref}
          >
            {dictionary.web.header.contact}
          </Link>
          <Button asChild className="mt-2" variant="outline">
            <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-in`}>
              {dictionary.web.header.signIn}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-up`}>
              {dictionary.web.header.signUp}
            </Link>
          </Button>
        </div>
      )}
    </header>
  );
};
