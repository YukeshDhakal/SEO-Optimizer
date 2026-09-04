"use client";

import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SiteTabsProps {
  readonly siteId: string;
}

const TABS = [
  { key: "", label: "Overview" },
  { key: "generate", label: "Generate" },
  { key: "runs", label: "Runs" },
  { key: "posts", label: "Posts" },
  { key: "posts/publish", label: "Publish now" },
  { key: "schedule", label: "Schedule" },
  { key: "recommendations", label: "Recommendations" },
  { key: "research", label: "Research" },
];

// The tab row from the Quillrun Design handoff's site-detail screens
// (Overview/Generate/Runs/Posts/Publish now/Schedule, plus Phase 9's
// Recommendations) - one shared component instead of each of those pages
// reimplementing its own header nav.
export const SiteTabs = ({ siteId }: SiteTabsProps) => {
  const pathname = usePathname();
  const base = `/sites/${siteId}`;

  const active = (() => {
    const rest = pathname.slice(base.length).replace(/^\/+/, "");
    if (rest.startsWith("runs")) {
      return "runs";
    }
    if (rest.startsWith("posts/publish")) {
      return "posts/publish";
    }
    if (rest.startsWith("posts")) {
      return "posts";
    }
    if (rest.startsWith("generate")) {
      return "generate";
    }
    if (rest.startsWith("schedule")) {
      return "schedule";
    }
    if (rest.startsWith("recommendations")) {
      return "recommendations";
    }
    if (rest.startsWith("research")) {
      return "research";
    }
    return "";
  })();

  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5 border-foreground border-b-[3px] pb-2">
      {TABS.map((tab) => (
        <Link
          className={cn(
            "border-[3px] px-3 py-1.5 font-bold text-sm",
            active === tab.key
              ? "border-foreground bg-primary text-primary-foreground"
              : "border-transparent text-muted-foreground hover:border-foreground hover:bg-accent hover:text-foreground"
          )}
          href={tab.key ? `${base}/${tab.key}` : base}
          key={tab.key}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
};
