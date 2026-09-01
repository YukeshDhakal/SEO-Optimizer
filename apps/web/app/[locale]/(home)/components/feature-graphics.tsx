// Four animated section graphics from the Claude Design handoff
// "Quillrun Visuals.dc.html" ("01 — Feature section graphics"), one per
// home-page feature item, in the same order as
// dictionary.web.home.features.items (Research / Quality gates / Publish
// anywhere / Kill switch — the dictionary copy and these graphics were
// designed together, titles match verbatim). Pure CSS/animation, no
// images — same "recreate the live output, don't port the preview
// runtime" rule as the rest of this redesign.
const BAR_HEIGHTS = [34, 52, 27, 64, 44, 92, 58, 38, 22];
const PICKED_INDEX = 5;

export const ResearchGraphic = () => (
  <div className="relative h-[288px] overflow-hidden border-[3px] border-foreground bg-card p-[22px] shadow-[8px_8px_0_#111]">
    <div
      className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(17,17,17,0.06)_0_1px,transparent_1px_32px)]"
      aria-hidden="true"
    />
    <div className="relative flex items-center justify-between gap-3">
      <span className="font-bold text-[11px] uppercase tracking-[0.14em]">
        Search Console → Keyword Planner
      </span>
      <span className="animate-[qr-pulse_2.4s_ease-in-out_infinite] border-2 border-foreground bg-accent px-1.5 py-0.5 font-bold text-[11px] tracking-[0.1em]">
        LIVE
      </span>
    </div>
    <div className="relative mt-6 grid h-[168px] grid-cols-9 items-end gap-2.5 border-foreground border-b-[3px]">
      {BAR_HEIGHTS.map((height, index) => (
        <div
          className={
            index === PICKED_INDEX
              ? "relative border-[3px] border-b-0 border-foreground bg-primary motion-safe:animate-[qr-bar_7s_cubic-bezier(0.22,1,0.36,1)_infinite]"
              : "border-[3px] border-b-0 border-foreground bg-secondary motion-safe:animate-[qr-bar_7s_cubic-bezier(0.22,1,0.36,1)_infinite]"
          }
          key={height}
          style={{ height: `${height}%`, animationDelay: `${index * 0.1}s` }}
        >
          {index === PICKED_INDEX && (
            <span className="-top-[34px] absolute left-1/2 -translate-x-1/2 whitespace-nowrap border-[3px] border-foreground bg-brand-yellow px-1.5 py-0.5 font-bold text-[10px] tracking-[0.08em]">
              PICKED
            </span>
          )}
        </div>
      ))}
    </div>
    <div className="relative mt-3 flex justify-between font-mono text-[11px] text-muted-foreground">
      <span>impressions × volume</span>
      <span>9 candidate queries</span>
    </div>
  </div>
);

const GATES = [
  { label: "SEO — structure & intent", verdict: "PASS", delay: 0, fail: false },
  { label: "GEO — citation-worthiness", verdict: "PASS", delay: 0.9, fail: false },
  { label: "Brand voice", verdict: "PASS", delay: 1.8, fail: false },
  { label: "Thin content", verdict: "FAIL", delay: 2.7, fail: true },
] as const;

export const QualityGatesGraphic = () => (
  <div className="flex h-[288px] flex-col gap-3 border-[3px] border-foreground bg-card p-[22px] shadow-[8px_8px_0_#111]">
    <div className="flex items-center justify-between">
      <span className="font-bold text-[11px] uppercase tracking-[0.14em]">
        Quality gate — draft #2
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        redraft 1 / 2
      </span>
    </div>
    {GATES.map((gate) => (
      <div
        className={
          gate.fail
            ? "flex items-center justify-between border-[3px] border-foreground bg-foreground px-3 py-2.5"
            : "flex items-center justify-between border-[3px] border-foreground bg-background px-3 py-2.5"
        }
        key={gate.label}
      >
        <span
          className={
            gate.fail
              ? "font-semibold text-background text-sm"
              : "font-semibold text-sm"
          }
        >
          {gate.label}
        </span>
        <span
          className={
            gate.fail
              ? "border-[3px] border-background bg-destructive px-2 py-0.5 font-bold text-[11px] text-white tracking-[0.1em] motion-safe:animate-[qr-stamp_8s_steps(1,end)_infinite]"
              : "border-[3px] border-foreground bg-accent px-2 py-0.5 font-bold text-[11px] tracking-[0.1em] motion-safe:animate-[qr-stamp_8s_steps(1,end)_infinite]"
          }
          style={{ animationDelay: `${gate.delay}s` }}
        >
          {gate.verdict}
        </span>
      </div>
    ))}
    <div className="mt-auto flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
      <span className="size-2.5 animate-[qr-pulse_1.6s_ease-in-out_infinite] border border-foreground bg-primary" />
      <span>failing gate → corrective redraft, never a publish</span>
    </div>
  </div>
);

const CMS_TARGETS = [
  { label: "WORDPRESS", className: "bg-secondary text-secondary-foreground", duration: 0.9 },
  { label: "WEBFLOW", className: "bg-card", duration: 1.1 },
  { label: "SHOPIFY", className: "bg-accent", duration: 0.8 },
  { label: "HOSTED BLOG", className: "bg-primary text-primary-foreground", duration: 1.3 },
] as const;

export const PublishGraphic = () => (
  <div className="relative grid h-[288px] grid-cols-[128px_1fr] items-center gap-[18px] overflow-hidden border-[3px] border-foreground bg-card p-[22px] shadow-[8px_8px_0_#111]">
    <div className="flex flex-col gap-1.5 border-[3px] border-foreground bg-brand-yellow p-3.5 shadow-[5px_5px_0_#111]">
      <span className="font-display text-[15px] leading-[1.05]">
        DRAFT
        <br />
        APPROVED
      </span>
      <span className="font-mono text-[10px]">one adapter API</span>
    </div>
    <div className="flex flex-col gap-3">
      {CMS_TARGETS.map((target) => (
        <div className="flex items-center" key={target.label}>
          <div
            className="h-[5px] flex-1 bg-[repeating-linear-gradient(90deg,#111111_0_14px,transparent_14px_28px)] bg-[length:28px_5px] motion-safe:animate-[qr-dash_linear_infinite]"
            style={{ animationDuration: `${target.duration}s` }}
          />
          <span
            className={`min-w-[112px] border-[3px] border-foreground px-2.5 py-1.5 text-center font-bold text-xs tracking-[0.06em] ${target.className}`}
          >
            {target.label}
          </span>
        </div>
      ))}
    </div>
    <span className="absolute bottom-4 left-[22px] font-mono text-[11px] text-muted-foreground">
      published under your own domain
    </span>
  </div>
);

export const KillSwitchGraphic = () => (
  <div className="grid h-[288px] grid-cols-[132px_1fr] items-center gap-[22px] border-[3px] border-foreground bg-background p-[22px] shadow-[8px_8px_0_#111]">
    <div className="relative grid place-items-center">
      <div className="absolute size-[118px] animate-[qr-ring_2.6s_ease-out_infinite] border-[3px] border-destructive" />
      <div
        className="absolute size-[118px] animate-[qr-ring_2.6s_ease-out_infinite] border-[3px] border-destructive"
        style={{ animationDelay: "1.3s" }}
      />
      <div className="relative grid size-[108px] place-items-center border-[3px] border-foreground bg-destructive shadow-[6px_6px_0_#111]">
        <span className="font-display text-[22px] text-white tracking-[0.02em]">
          STOP
        </span>
      </div>
    </div>
    <div className="flex flex-col gap-2.5">
      <span className="font-bold text-[11px] uppercase tracking-[0.14em]">
        Checked twice per run
      </span>
      <div className="flex items-center justify-between border-[3px] border-foreground bg-card px-2.5 py-2">
        <span className="font-semibold text-[13px]">Pause this site</span>
        <span className="block h-5 w-10 border-[3px] border-foreground bg-accent" />
      </div>
      <div className="flex items-center justify-between border-[3px] border-foreground bg-card px-2.5 py-2">
        <span className="font-semibold text-[13px]">Pause organization</span>
        <span className="block h-5 w-10 border-[3px] border-foreground bg-card" />
      </div>
      <div className="flex items-center justify-between border-[3px] border-foreground bg-foreground px-2.5 py-2">
        <span className="font-semibold text-[13px] text-background">
          Emergency stop
        </span>
        <span className="animate-[qr-pulse_1.8s_ease-in-out_infinite] border-2 border-background px-1 py-0.5 font-mono text-[10px] text-background">
          ARMED
        </span>
      </div>
    </div>
  </div>
);

export const FEATURE_GRAPHICS = [
  ResearchGraphic,
  QualityGatesGraphic,
  PublishGraphic,
  KillSwitchGraphic,
] as const;
