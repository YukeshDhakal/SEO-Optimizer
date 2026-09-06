import { getPlatformStats } from "@/lib/platform-stats";

// Real aggregate numbers from the database (see lib/platform-stats.ts),
// replacing the design's placeholder figures - no fabricated fallback if
// the real counts are small or zero pre-launch.
export const Stats = async () => {
  const stats = await getPlatformStats();

  const items = [
    { value: stats.postsPublished.toLocaleString("en-US"), label: "posts published" },
    {
      value: stats.gatePassRatePct === null ? "—" : `${stats.gatePassRatePct}%`,
      label: "runs that succeed",
    },
    { value: "3", label: "CMSes, one API" },
  ];

  return (
    <div className="flex w-full flex-wrap items-center gap-8 border-b-[3px] border-foreground bg-muted px-4 py-6 lg:px-8">
      <div className="container mx-auto flex flex-wrap items-center gap-8">
        {items.map((s) => (
          <div className="flex flex-col" key={s.label}>
            <span className="font-display text-3xl tracking-tight">{s.value}</span>
            <span className="font-mono text-muted-foreground text-xs">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
