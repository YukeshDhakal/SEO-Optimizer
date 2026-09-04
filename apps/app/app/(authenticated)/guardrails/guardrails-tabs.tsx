"use client";

import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "", label: "Guardrails" },
  { key: "billing", label: "Billing" },
  { key: "audit", label: "Audit log" },
  { key: "api-keys", label: "API keys" },
];

const LEADING_SLASHES = /^\/+/;

// Same shared-tab-row pattern as sites/[id]/site-tabs.tsx, applied to the
// /guardrails area: Billing, Audit log, and API keys were previously reached
// via plain button-links on the guardrails page itself, which meant the only
// way back from any of those three was a bare text link at the bottom of the
// page. One tab row, present on all four pages, replaces both.
export const GuardrailsTabs = () => {
  const pathname = usePathname();
  const base = "/guardrails";

  const active = (() => {
    const rest = pathname.slice(base.length).replace(LEADING_SLASHES, "");
    if (rest.startsWith("billing")) {
      return "billing";
    }
    if (rest.startsWith("audit")) {
      return "audit";
    }
    if (rest.startsWith("api-keys")) {
      return "api-keys";
    }
    return "";
  })();

  return (
    <div className="mb-1 flex flex-wrap items-center gap-1.5 border-foreground border-b-[3px] pb-2">
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
