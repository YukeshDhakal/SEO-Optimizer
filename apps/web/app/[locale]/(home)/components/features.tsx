export const Features = () => (
  <div className="w-full border-b-[3px] border-foreground py-14 lg:py-20">
    <div className="container mx-auto grid gap-4 px-4 md:grid-cols-3">
      <div className="flex flex-col gap-3 border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111]">
        <span className="w-fit border-2 border-foreground bg-brand-lime px-1.5 py-0.5 font-bold text-[10px]">
          NEW
        </span>
        <h3 className="font-display text-xl leading-tight">
          Research that cites its sources
        </h3>
        <p className="text-sm leading-relaxed">
          The agent fetches real pages, extracts facts into a per-site
          knowledge base, and drafts against those facts. Every claim in a
          draft traces back to a URL it actually read — which is also what
          makes the writing citable by AI answers.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111]">
        <h3 className="font-display text-xl leading-tight">
          Quality gates that fail closed
        </h3>
        <p className="text-sm leading-relaxed">
          Length, keyword coverage, internal links, originality, citability.
          A draft that misses a gate never reaches your site — it stops and
          tells you which gate it failed and why.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span className="border-2 border-foreground bg-brand-lime px-2 py-0.5 font-bold text-[11px]">✓ LENGTH</span>
          <span className="border-2 border-foreground bg-brand-lime px-2 py-0.5 font-bold text-[11px]">✓ COVERAGE</span>
          <span className="border-2 border-foreground bg-foreground px-2 py-0.5 font-bold text-[11px] text-background">✕ THIN SECTION</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-[3px] border-foreground bg-brand-yellow p-5 shadow-[6px_6px_0_#111]">
        <span className="w-fit border-2 border-foreground bg-card px-1.5 py-0.5 font-bold text-[10px]">
          NEW
        </span>
        <h3 className="font-display text-xl leading-tight">
          It tells you what to fix next
        </h3>
        <p className="text-sm leading-relaxed">
          The recommendation engine watches Search Console — title and meta
          problems, keyword gaps, indexing errors, pages with zero traction —
          and ranks what to fix on your existing pages, not just what to
          write next.
        </p>
      </div>
    </div>
  </div>
);
