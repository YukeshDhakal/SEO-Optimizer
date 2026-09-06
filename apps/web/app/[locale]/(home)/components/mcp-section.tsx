import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { localeHref } from "@/lib/locale-href";

interface McpSectionProps {
  locale: string;
}

// Endpoint intentionally omitted here (kept to the /product/mcp page itself,
// which has the real quillrun-api.vercel.app/mcp URL and the verified tool
// list) - this teaser only needs to sell the idea and link through.
export const McpSection = ({ locale }: McpSectionProps) => (
  <div className="w-full border-b-[3px] border-foreground bg-foreground py-14 text-background lg:py-20">
    <div className="container mx-auto grid gap-8 px-4 lg:grid-cols-2 lg:items-center">
      <div className="flex flex-col gap-4">
        <span className="w-fit border-[3px] border-background bg-primary px-2.5 py-1 font-bold text-[11px] text-foreground uppercase tracking-[0.08em]">
          New · MCP server
        </span>
        <h2 className="font-display text-3xl leading-[1.05] tracking-tight md:text-4xl">
          Bring your own AI client.
        </h2>
        <p className="max-w-md text-background/80 text-sm leading-relaxed md:text-base">
          Generate an API key and point Claude, Cursor, ChatGPT or Codex at
          your workspace over MCP. Your agent reads your sites, drafts, runs
          the same gates and publishes — scoped to your org only, with
          per-key monthly limits and one-click revoke.
        </p>
        <Button asChild className="w-fit" variant="default">
          <Link href={localeHref(locale, "/product/mcp")}>Read the MCP docs</Link>
        </Button>
      </div>
      <div className="border-[3px] border-background bg-background/5">
        <div className="flex items-center gap-2 border-background border-b-[3px] px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 border border-background bg-brand-lime" />
          <span className="font-mono text-background/70 text-xs">mcp.json</span>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-brand-lime text-xs leading-relaxed">
{`"quillrun": {
  "url": "https://quillrun-api.vercel.app/mcp",
  "headers": {
    "Authorization": "Bearer qr_live_ab12…"
  }
}`}
        </pre>
      </div>
    </div>
  </div>
);
