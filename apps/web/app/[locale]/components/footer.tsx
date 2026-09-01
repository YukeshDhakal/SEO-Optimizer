import { Status } from "@repo/observability/status";
import Link from "next/link";
import { env } from "@/env";
import { legalDocs, legalSlugs } from "@/lib/legal-content";

// Matches the neobrutalism handoff's footer exactly: black section, cream
// text, three columns (brand+tagline / Pages / Legal), uppercase
// letter-spaced micro-labels above each link column.
export const Footer = () => {
  const pageLinks = [
    { title: "Home", href: "/" },
    { title: "Writing", href: "/blog" },
    { title: "Pricing", href: "/pricing" },
    ...(env.NEXT_PUBLIC_DOCS_URL
      ? [{ title: "Docs", href: env.NEXT_PUBLIC_DOCS_URL }]
      : []),
  ];

  const legalLinks = legalSlugs.map((slug) => ({
    title: legalDocs[slug].title,
    href: `/legal/${slug}`,
  }));

  return (
    <footer className="bg-foreground text-background">
      <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <span className="font-display text-2xl tracking-tight">
            QUILLRUN
          </span>
          <p className="max-w-sm text-background/70 text-sm leading-relaxed">
            Autonomous content operations for small teams and the agencies
            that run them.
          </p>
          <div className="mt-2">
            <Status />
          </div>
        </div>
        <div className="flex flex-col gap-2.5 text-sm">
          <span className="text-[12px] text-background/50 uppercase tracking-[0.14em]">
            Pages
          </span>
          {pageLinks.map((item) => (
            <Link
              className="font-semibold text-background hover:text-primary"
              href={item.href}
              key={item.title}
              rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
              target={item.href.startsWith("http") ? "_blank" : undefined}
            >
              {item.title}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 text-sm">
          <span className="text-[12px] text-background/50 uppercase tracking-[0.14em]">
            Legal
          </span>
          {legalLinks.map((item) => (
            <Link
              className="font-semibold text-background hover:text-primary"
              href={item.href}
              key={item.title}
            >
              {item.title}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
};
