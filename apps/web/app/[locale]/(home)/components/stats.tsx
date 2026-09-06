const STATS = [
  { value: "12,400", label: "posts published" },
  { value: "88%", label: "pass the gates first try" },
  { value: "3", label: "CMSes, one API" },
];

// Values are explicitly the design's own placeholder numbers, badged as
// such rather than presented as real - swap for real numbers before launch.
export const Stats = () => (
  <div className="flex w-full flex-wrap items-center gap-8 border-b-[3px] border-foreground bg-muted px-4 py-6 lg:px-8">
    <div className="container mx-auto flex flex-wrap items-center gap-8">
      {STATS.map((s) => (
        <div className="flex flex-col" key={s.label}>
          <span className="font-display text-3xl tracking-tight">{s.value}</span>
          <span className="font-mono text-muted-foreground text-xs">{s.label}</span>
        </div>
      ))}
      <span className="flex-1" />
      <span className="border-2 border-foreground bg-brand-lime px-2 py-0.5 font-bold text-[10px] uppercase tracking-[0.08em]">
        Placeholder — replace with real numbers before launch
      </span>
    </div>
  </div>
);
