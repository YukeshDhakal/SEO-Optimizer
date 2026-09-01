const MARQUEE_ITEMS = [
  "Built for teams managing content at scale",
  "WordPress",
  "Webflow",
  "Shopify",
  "Hosted blog",
  "Search Console",
  "Keyword Planner",
];

// Matches the neobrutalism handoff's marquee strip exactly — a scrolling
// black band between the hero and the features section. Replaces the
// previous placeholder "Logo 1..15" carousel (never real content to begin
// with) with the mock's actual supported-platforms strip.
export const Cases = () => (
  <div className="w-full overflow-hidden border-b-[3px] border-foreground bg-foreground py-4">
    <div className="flex w-max animate-[qr-marquee_26s_linear_infinite] gap-14 whitespace-nowrap font-bold text-[15px] text-background uppercase tracking-[0.06em]">
      {[0, 1].map((rep) => (
        <div className="flex gap-14" key={rep}>
          {MARQUEE_ITEMS.map((item) => (
            <span className="flex items-center gap-14" key={item}>
              {item}
              <span className="text-primary">✳</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  </div>
);
