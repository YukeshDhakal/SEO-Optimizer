// Next.js App Router Suspense boundary for every page under (authenticated)
// — this repo had zero loading.tsx files anywhere before this, so a route
// with any async data fetch (nearly all of them: they all read from
// Supabase) rendered a blank white page during navigation instead of an
// immediate visual response. Sits alongside layout.tsx (not inside it), so
// GlobalSidebar/StatusBar stay mounted and only the content area shows this
// while the destination page's own server data fetch resolves. Deliberately
// generic (a couple of pulsing card placeholders, not a per-page skeleton)
// since one file covers every route in this segment — the goal is "visibly
// alive, not stuck," not a pixel-matched preview of the destination page.
const LoadingBlock = () => (
  <div className="border-[3px] border-foreground bg-card shadow-[6px_6px_0_#111]">
    <div className="border-foreground border-b-[3px] px-5 py-3.5">
      <div className="h-4 w-40 animate-pulse bg-accent" />
    </div>
    <div className="flex flex-col divide-y-2 divide-foreground px-5">
      {[0, 1, 2].map((i) => (
        <div className="flex items-center justify-between gap-4 py-3.5" key={i}>
          <div className="flex-1">
            <div className="h-3.5 w-1/3 animate-pulse bg-accent" />
            <div className="mt-2 h-3 w-2/3 animate-pulse bg-accent/70" />
          </div>
          <div className="h-5 w-16 shrink-0 animate-pulse border-2 border-foreground bg-accent" />
        </div>
      ))}
    </div>
  </div>
);

const AuthenticatedLoading = () => (
  <div className="flex flex-1 flex-col gap-5 p-6">
    <div className="flex items-center gap-2.5">
      <span className="size-2.5 animate-[qr-pulse_1.6s_ease-in-out_infinite] border border-foreground bg-status-info-fg" />
      <div className="h-7 w-56 animate-pulse bg-accent" />
    </div>
    <LoadingBlock />
  </div>
);

export default AuthenticatedLoading;
