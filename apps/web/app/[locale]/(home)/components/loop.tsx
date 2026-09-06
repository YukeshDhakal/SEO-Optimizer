interface LoopStep {
  readonly n: string;
  readonly title: string;
  readonly body: string;
  readonly isNew?: boolean;
  readonly bg?: string;
}

const LOOP: readonly LoopStep[] = [
  { n: "01", title: "RESEARCH", isNew: true, body: "Pulls your Search Console queries and Google Ads volumes, fetches real sources, and extracts the facts into a knowledge base for your site." },
  { n: "02", title: "DRAFT", body: "Writes against those extracted facts rather than from model memory, so claims trace back to a page it actually read." },
  { n: "03", title: "QUALITY GATES", body: "Length, keyword coverage, internal links, originality, citability. Miss one and the run stops — it fails closed, never open." },
  { n: "04", title: "APPROVAL", bg: "bg-brand-yellow", body: "Optional human gate. Leave it on and nothing touches your site until you press approve; turn it off per site once you trust it." },
  { n: "05", title: "PUBLISH", body: "Into WordPress, Shopify or Webflow as a real post or product page. Three failed publishes in a row and the site auto-pauses." },
  { n: "06", title: "RECOMMEND", isNew: true, body: "Watches indexing and traction afterwards, then ranks what to fix or refresh — closing the loop instead of just adding pages." },
];

export const Loop = () => (
  <div className="w-full border-b-[3px] border-foreground py-14 lg:py-20">
    <div className="container mx-auto px-4">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <h2 className="font-display max-w-xl text-3xl leading-[1.05] tracking-tight md:text-4xl">
          Six steps, and you can stand on the brakes at any one of them.
        </h2>
        <p className="max-w-sm text-sm leading-relaxed">
          The whole loop is visible while it runs. Two of these steps are new
          this quarter — research is now grounded in fetched sources, and the
          agent tells you what to fix after publishing.
        </p>
      </div>
      <div className="grid gap-3.5 md:grid-cols-3">
        {LOOP.map((step) => (
          <div
            className={`flex flex-col gap-2 border-[3px] border-foreground p-4 shadow-[5px_5px_0_#111] ${step.bg ?? "bg-card"}`}
            key={step.n}
          >
            <div className="flex items-center gap-2">
              <span className="border-2 border-foreground bg-background px-1.5 py-0.5 font-mono text-xs">
                {step.n}
              </span>
              <span className="font-display text-sm tracking-wide">{step.title}</span>
              {step.isNew && (
                <span className="border-2 border-foreground bg-brand-lime px-1.5 py-0.5 font-bold text-[10px]">
                  NEW
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);
