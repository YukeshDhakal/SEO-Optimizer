const GUARDRAILS = [
  { title: "One kill switch", body: "Stop every run across every site from the bar that sits above every screen." },
  { title: "Approval gates", body: "Per site. Nothing publishes without a human until you decide otherwise." },
  { title: "Auto-pause", body: "Three consecutive publish failures pauses the site rather than hammering your CMS." },
  { title: "Full audit log", body: "Who changed what, which key did it, when. Exportable for a client review." },
];

export const Guardrails = () => (
  <div className="w-full border-b-[3px] border-foreground py-14 lg:py-20">
    <div className="container mx-auto px-4">
      <h2 className="font-display mb-2 text-3xl tracking-tight md:text-4xl">
        You are still in charge of the thing.
      </h2>
      <p className="mb-7 max-w-xl text-sm leading-relaxed md:text-base">
        Every objection to letting an agent write on your domain has a
        control here.
      </p>
      <div className="grid gap-3.5 md:grid-cols-4">
        {GUARDRAILS.map((g) => (
          <div className="flex flex-col gap-1.5 border-[3px] border-foreground bg-card p-4 shadow-[5px_5px_0_#111]" key={g.title}>
            <span className="font-display text-sm">{g.title}</span>
            <p className="text-muted-foreground text-sm leading-relaxed">{g.body}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);
