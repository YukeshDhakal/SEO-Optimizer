import type { Dictionary } from "@repo/internationalization";
import { MoveDownLeft, MoveUpRight } from "lucide-react";

interface StatsProps {
  dictionary: Dictionary;
}

export const Stats = ({ dictionary }: StatsProps) => (
  <div className="w-full border-b-[3px] border-foreground bg-accent py-16 lg:py-20">
    <div className="container mx-auto flex flex-col gap-9 px-4">
      <div className="flex flex-col gap-2">
        <h2 className="font-display max-w-3xl text-3xl leading-[1.05] tracking-tight md:text-5xl">
          {dictionary.web.home.stats.title}
        </h2>
        <p className="max-w-xl text-base leading-relaxed">
          {dictionary.web.home.stats.description}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {dictionary.web.home.stats.items.map((item) => (
          <div
            className="flex flex-col justify-between gap-1 border-[3px] border-foreground bg-card p-5 shadow-[6px_6px_0_#111] transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[10px_10px_0_#111]"
            key={item.title}
          >
            <div className="flex items-end gap-2">
              <span className="font-display text-5xl tracking-tight">
                {item.type === "currency" && "$"}
                {new Intl.NumberFormat().format(Number.parseFloat(item.metric))}
              </span>
              {Number.parseFloat(item.delta) > 0 ? (
                <MoveUpRight aria-hidden="true" className="mb-1 h-4 w-4 text-primary" />
              ) : (
                <MoveDownLeft aria-hidden="true" className="mb-1 h-4 w-4 text-destructive" />
              )}
            </div>
            <p className="mt-1 font-semibold text-sm">{item.title}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);
