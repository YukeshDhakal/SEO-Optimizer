import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/design-system/components/ui/breadcrumb";
import { Button } from "@repo/design-system/components/ui/button";
import type { BreadcrumbList as BreadcrumbListSchema, FAQPage, WithContext } from "@repo/seo/json-ld";
import { JsonLd } from "@repo/seo/json-ld";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/env";
import { localeHref } from "@/lib/locale-href";

// Real tool list + endpoint, verified against apps/api's actual MCP route
// (packages/mcp / apps/api's `/mcp` handler) and PRD.md Phase 10 - the
// design handoff this page is based on named 6 different tool names
// (create_draft, run_quality_gates, research_topic) that don't exist as
// such, and a domain (mcp.quillrun.dev) that was never configured. Picked
// 6 of the real 11 tools closest to the design's intent, with their actual
// names and behaviour.
const MCP_ENDPOINT = "https://quillrun-api.vercel.app/mcp";

const mcpTools = [
  { name: "list_sites", desc: "Every site in the org, with connection and pause state." },
  { name: "get_recommendations", desc: "Ranked fixes from Search Console — scored, with the reason." },
  { name: "generate_content", desc: "Runs the full research → draft → gates pipeline for a topic." },
  { name: "get_run_status", desc: "Live stage, gate results and any error for a run in flight." },
  { name: "publish_draft", desc: "Publishes an approved draft. Respects the approval gate." },
  { name: "list_schedules", desc: "Every recurring schedule configured for the org's sites." },
] as const;

const cantDo = [
  "Touch another org. A key is bound to one org at issue time.",
  "Skip a quality gate, or publish past an approval gate.",
  "Exceed the key's monthly call cap — calls are rejected, not billed.",
  "Keep working after you revoke. Revocation is immediate.",
  "Act unlogged. Every call lands in the audit log with its key name.",
];

const faqs = [
  {
    q: "Is my content used to train anything?",
    a: "No. Your sites, facts and drafts stay in your org and aren't used for training.",
  },
  {
    q: "Can I give a client their own key?",
    a: "Yes — one key per client machine, each with its own cap, each revocable without affecting the others.",
  },
  {
    q: "I lost my key. Can you resend it?",
    a: "No — we only keep a hash. Revoke the old one and create a replacement; it takes a few seconds.",
  },
];

interface McpPageProps {
  params: Promise<{ locale: string }>;
}

export const generateMetadata = async (): Promise<Metadata> =>
  createMetadata({
    title: "MCP server — connect Claude, Cursor or ChatGPT",
    description:
      "Generate an API key and point any MCP-capable client at your Quillrun workspace: read your sites, research a topic, draft against real facts, run your quality gates and publish — scoped to your org, all logged.",
  });

const McpPage = async ({ params }: McpPageProps) => {
  const { locale } = await params;

  const faqJsonLd: WithContext<FAQPage> = {
    "@type": "FAQPage",
    "@context": "https://schema.org",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbJsonLd: WithContext<BreadcrumbListSchema> = {
    "@type": "BreadcrumbList",
    "@context": "https://schema.org",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: localeHref(locale, "/") },
      { "@type": "ListItem", position: 2, name: "MCP server", item: localeHref(locale, "/product/mcp") },
    ],
  };

  return (
    <main className="w-full">
      <JsonLd code={faqJsonLd} />
      <JsonLd code={breadcrumbJsonLd} />

      <div className="border-b-[3px] border-foreground py-3">
        <div className="container mx-auto px-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={localeHref(locale, "/")}>Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>MCP server</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      <section className="container mx-auto grid gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center lg:py-20">
        <div className="flex flex-col gap-5">
          <span className="w-fit border-[3px] border-foreground bg-brand-lime px-3 py-1 font-bold text-xs uppercase tracking-[0.1em]">
            MCP server · shipped
          </span>
          <h1 className="font-display text-4xl leading-[1.0] tracking-tight md:text-5xl">
            Connect Claude, Cursor or ChatGPT to your own workspace.
          </h1>
          <p className="max-w-lg text-base leading-relaxed md:text-lg">
            Generate an API key, paste one config block, and your AI client
            can read your sites, research a topic, draft against real facts,
            run your quality gates and publish — all scoped to your org, all
            logged.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-up`}>Get an API key</Link>
            </Button>
            {env.NEXT_PUBLIC_DOCS_URL && (
              <Button asChild variant="outline">
                <Link href={env.NEXT_PUBLIC_DOCS_URL} rel="noopener noreferrer" target="_blank">
                  Read the docs →
                </Link>
              </Button>
            )}
          </div>
          <span className="font-mono text-muted-foreground text-xs">
            Speaks standard MCP over a bearer token · works with any
            MCP-capable client
          </span>
        </div>

        <div className="border-[3px] border-foreground bg-foreground text-background shadow-[7px_7px_0_#111]">
          <div className="flex items-center gap-2 border-background/30 border-b-[3px] px-4 py-2.5">
            <span className="h-2.5 w-2.5 border border-background bg-brand-lime" />
            <span className="font-mono text-xs">claude_desktop_config.json</span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-brand-lime text-xs leading-relaxed">
{`{
  "mcpServers": {
    "quillrun": {
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer qr_live_ab12…"
      }
    }
  }
}`}
          </pre>
          <div className="border-background/30 border-t-[3px] px-4 py-2.5 font-mono text-[11px] text-background/70">
            that's the whole setup
          </div>
        </div>
      </section>

      <section className="border-t-[3px] border-foreground py-14">
        <div className="container mx-auto px-4">
          <h2 className="font-display mb-5 text-3xl tracking-tight">
            Three steps, about two minutes
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { n: "01", title: "Create a key", body: "In Guardrails → API keys. Name it after the client or machine, set a monthly call cap if you want one.", bg: "bg-card" },
              { n: "02", title: "Copy it once", body: "The full key is shown exactly once — we store a hash, never the key. Paste it into your client's config.", bg: "bg-brand-yellow" },
              { n: "03", title: "Ask it to work", body: "\"Find the three pages losing traffic on your site and draft refreshes.\" It uses your tools, your gates.", bg: "bg-card" },
            ].map((step) => (
              <div className={`flex flex-col gap-2 border-[3px] border-foreground p-4 shadow-[5px_5px_0_#111] ${step.bg}`} key={step.n}>
                <span className="w-fit border-2 border-foreground bg-background px-1.5 py-0.5 font-mono text-xs">{step.n}</span>
                <h3 className="font-display text-base">{step.title}</h3>
                <p className="text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t-[3px] border-foreground py-14">
        <div className="container mx-auto grid gap-8 px-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl tracking-tight">What your client can do</h2>
            <div className="border-[3px] border-foreground shadow-[6px_6px_0_#111]">
              {mcpTools.map((t) => (
                <div className="flex items-baseline gap-3 border-border border-b px-4 py-2.5 last:border-b-0" key={t.name}>
                  <code className="w-40 shrink-0 font-mono text-secondary text-xs">{t.name}</code>
                  <span className="text-sm">{t.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The same tools the Quillrun UI uses — so an agent can't do
              anything through MCP that you couldn't do by hand, including
              bypassing a gate.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl tracking-tight">And what it can't</h2>
            <div className="flex flex-col gap-2.5 border-[3px] border-foreground bg-brand-yellow p-4 shadow-[6px_6px_0_#111]">
              {cantDo.map((item) => (
                <span className="flex gap-2 text-sm leading-relaxed" key={item}>
                  <span className="shrink-0 font-bold">✕</span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t-[3px] border-foreground py-14">
        <div className="container mx-auto grid gap-8 px-4 md:grid-cols-2">
          <h2 className="font-display text-2xl tracking-tight">Questions</h2>
          <div className="flex flex-col">
            {faqs.map((f) => (
              <div className="flex flex-col gap-1 border-border/60 border-t py-4" key={f.q}>
                <span className="font-bold text-sm">{f.q}</span>
                <span className="text-muted-foreground text-sm leading-relaxed">{f.a}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col items-center gap-4 border-t-[3px] border-foreground bg-primary py-16 text-center">
        <h2 className="font-display max-w-xl px-4 text-3xl tracking-tight md:text-4xl">
          Your agent, your CMS, your rules.
        </h2>
        <Button asChild variant="default">
          <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-up`}>Get an API key</Link>
        </Button>
      </section>
    </main>
  );
};

export default McpPage;
