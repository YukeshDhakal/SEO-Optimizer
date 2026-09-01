import type { Dictionary } from "@repo/internationalization";

interface FeaturesProps {
  dictionary: Dictionary;
}

const BADGE_COLORS = ["bg-accent", "bg-primary", "bg-secondary text-secondary-foreground", "bg-brand-yellow"];

export const Features = ({ dictionary }: FeaturesProps) => (
  <div className="w-full border-b-[3px] border-foreground py-16 lg:py-20">
    <div className="container mx-auto px-4">
      <div className="flex flex-col gap-9">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
          <h2 className="font-display max-w-xl text-3xl leading-[1.02] tracking-tight md:text-5xl">
            {dictionary.web.home.features.title}
          </h2>
          <p className="max-w-md text-base leading-relaxed">
            {dictionary.web.home.features.description}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {dictionary.web.home.features.items.map((item, index) => (
            <div
              className="flex flex-col gap-3 border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111] transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[10px_10px_0_#111]"
              key={item.title}
            >
              <div
                className={`font-display flex h-10 w-10 items-center justify-center border-[3px] border-foreground text-base ${BADGE_COLORS[index % BADGE_COLORS.length]}`}
              >
                {String(index + 1).padStart(2, "0")}
              </div>
              <h3 className="font-bold text-lg leading-tight">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);
