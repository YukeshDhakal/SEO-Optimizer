import { Feather } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";

// Left panel of the sign-in/sign-up screen — from the Claude Design
// handoff "Quillrun Visuals.dc.html" ("02 — Sign-in screen"). A looping
// animated visualization of one pipeline run (Research -> Draft -> Gate
// -> Publish), each step stamping DONE/PASS/LIVE in turn with a progress
// fill bar, plus a scrolling run-log ticker underneath. Replaces the
// previous static quote panel with something that actually demonstrates
// the product's core trust claim (a run is visible, not a black box)
// before the user even signs in. Purely decorative/CSS - no real run data,
// same posture as the mock's own {{ }} placeholders.
const STEPS = [
  { n: "01", label: "Research topic", stamp: "DONE", delay: 0 },
  { n: "02", label: "Write the draft", stamp: "DONE", delay: 3 },
  { n: "03", label: "SEO + GEO gate", stamp: "PASS", delay: 6 },
  { n: "04", label: "Publish to your CMS", stamp: "LIVE", delay: 9 },
] as const;

const RUN_LOG =
  "topic.select ok  ·  search.grounded 7 citations  ·  draft.write 1,420 words  ·  gate.seo pass  ·  gate.geo pass  ·  killswitch.check clear  ·  cms.wordpress 201 created  ·  ";

export const PipelineRunPanel = () => (
  <div className="relative flex min-h-full flex-col gap-6 overflow-hidden bg-accent p-9 text-foreground">
    <div
      className="pointer-events-none absolute -inset-16 animate-[qr-drift_6s_linear_infinite] bg-[repeating-linear-gradient(0deg,rgba(17,17,17,0.10)_0_2px,transparent_2px_40px),repeating-linear-gradient(90deg,rgba(17,17,17,0.10)_0_2px,transparent_2px_40px)]"
      aria-hidden="true"
    />

    <Link
      className="relative flex w-fit items-center gap-2.5 transition-opacity hover:opacity-80"
      href={env.NEXT_PUBLIC_WEB_URL}
    >
      <Feather aria-hidden="true" className="h-7 w-7 text-primary" strokeWidth={2.25} />
      <span className="font-display text-xl tracking-tight">QUILLRUN</span>
    </Link>

    <div className="relative flex flex-col gap-2.5">
      <h2 className="font-display max-w-[420px] text-4xl leading-[0.98] tracking-tight">
        A run is in flight right now.
      </h2>
      <p className="max-w-sm text-[15px] leading-relaxed">
        Research, draft, gate, publish — four steps, all of them visible, all
        of them reversible.
      </p>
    </div>

    <div className="relative flex flex-col gap-3">
      {STEPS.map((step) => (
        <div
          className="relative flex items-center justify-between gap-3 overflow-hidden border-[3px] border-foreground bg-card px-3.5 py-3 text-card-foreground shadow-[5px_5px_0_#111]"
          key={step.n}
        >
          <span className="flex items-center gap-2.5 font-bold text-sm">
            <span className="border-2 border-foreground px-1.5 py-0.5 font-mono text-[11px]">
              {step.n}
            </span>
            {step.label}
          </span>
          <span
            className="border-[3px] border-foreground bg-accent px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] motion-safe:animate-[qr-stamp_12s_steps(1,end)_infinite]"
            style={{ animationDelay: `${step.delay}s` }}
          >
            {step.stamp}
          </span>
          <span
            className="absolute bottom-0 left-0 h-1.5 border-t-[3px] border-foreground bg-primary motion-safe:animate-[qr-fill_12s_linear_infinite]"
            style={{ animationDelay: `${step.delay}s` }}
          />
        </div>
      ))}
    </div>

    <div className="relative mt-auto overflow-hidden border-[3px] border-foreground bg-foreground">
      <div className="flex items-center gap-2 border-foreground border-b-[3px] px-2.5 py-1.5">
        <span className="size-2 animate-[qr-pulse_1.4s_ease-in-out_infinite] bg-accent" />
        <span className="font-mono text-[10px] text-background tracking-[0.16em]">
          RUN LOG
        </span>
      </div>
      <div className="flex w-max animate-[qr-marquee_30s_linear_infinite]">
        {[0, 1].map((rep) => (
          <span
            className="whitespace-nowrap py-2 font-mono text-[11px] text-accent"
            key={rep}
          >
            {RUN_LOG}
          </span>
        ))}
      </div>
    </div>
  </div>
);
