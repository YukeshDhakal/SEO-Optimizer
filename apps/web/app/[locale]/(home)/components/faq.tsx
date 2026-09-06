const FAQS = [
  {
    q: "Will this publish rubbish on my site?",
    a: "It can't reach your site unless it passes every quality gate, and by default a human approves each piece. Both are visible while a run is in flight.",
  },
  {
    q: "Does Google penalise AI content?",
    a: "Google ranks helpful content regardless of how it was produced. The gates exist to enforce the \"helpful\" part — grounding, originality, depth — not to hide the origin.",
  },
  {
    q: "Which CMSes do you publish into?",
    a: "WordPress, Shopify and Webflow today, over the CMS's own API. Search Console and Google Ads are read-only inputs.",
  },
  {
    q: "Can I use my own AI client instead of yours?",
    a: "Yes — generate an API key and connect Claude, Cursor, ChatGPT or Codex to your workspace over MCP. The same gates and limits apply.",
  },
  {
    q: "What happens if I want to stop everything right now?",
    a: "One button in the status bar halts every run and blocks publishing org-wide until you resume.",
  },
  {
    q: "How do agencies keep clients separate?",
    a: "One org per client, with its own sites, keys, limits and audit log. Keys are scoped to a single org and revocable in one click.",
  },
];

export const FAQ = () => (
  <div className="w-full border-b-[3px] border-foreground py-14 lg:py-20">
    <div className="container mx-auto grid gap-8 px-4 md:grid-cols-2">
      <h2 className="font-display text-3xl tracking-tight md:text-4xl">
        Questions people actually ask
      </h2>
      <div className="flex flex-col">
        {FAQS.map((f) => (
          <div className="flex flex-col gap-1 border-border/60 border-t py-4" key={f.q}>
            <span className="font-bold text-sm">{f.q}</span>
            <span className="text-muted-foreground text-sm leading-relaxed">{f.a}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);
