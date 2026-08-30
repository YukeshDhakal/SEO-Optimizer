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
  { key: "posts/new", label: "Publish now" },
  { key: "schedule", label: "Schedule" },
];

// The tab row from the Quillrun Design handoff's site-detail screens
// (Overview/Generate/Runs/Posts/Publish now/Schedule) - one shared
// component instead of each of those six pages reimplementing its own
// header nav.
export const SiteTabs = ({ siteId }: SiteTabsProps) => {
  const pathname = usePathname();
  const base = `/sites/${siteId}`;

  const active = (() => {
    const rest = pathname.slice(base.length).replace(/^\/+/, "");
    if (rest.startsWith("runs")) {
      return "runs";
    }
    if (rest.startsWith("posts/new")) {
      return "posts/new";
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
    return "";
  })();

  return (
    <div className="mb-5 flex flex-wrap items-center gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          className={cn(
            "-mb-px border-b-2 px-3 py-2 font-medium text-sm",
            active === tab.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
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
