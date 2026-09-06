// Replaces the animated marquee with the design's static labelled strip -
// splits "publishes into" (write access) from "reads from" (read-only
// inputs), which the marquee's flat platform list didn't distinguish.
export const Cases = () => (
  <div className="flex w-full flex-wrap items-center gap-4 border-b-[3px] border-foreground bg-muted px-4 py-4 lg:px-8">
    <div className="container mx-auto flex flex-wrap items-center gap-4">
      <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
        Publishes into
      </span>
      <span className="font-bold text-sm">WordPress</span>
      <span className="font-bold text-sm">Shopify</span>
      <span className="font-bold text-sm">Webflow</span>
      <span className="text-muted-foreground">·</span>
      <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
        Reads from
      </span>
      <span className="font-bold text-sm">Search Console</span>
      <span className="font-bold text-sm">Google Ads</span>
      <span className="flex-1" />
      <span className="border-2 border-foreground bg-brand-lime px-2 py-0.5 font-bold text-[10px] uppercase tracking-[0.08em]">
        Placeholder — send customer logos
      </span>
    </div>
  </div>
);
