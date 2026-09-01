import type { Dictionary } from "@repo/internationalization";
import { FEATURE_GRAPHICS } from "./feature-graphics";

interface FeaturesProps {
  dictionary: Dictionary;
}

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
        <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
          {dictionary.web.home.features.items.map((item, index) => {
            const Graphic = FEATURE_GRAPHICS[index % FEATURE_GRAPHICS.length];
            return (
              <figure className="m-0 flex flex-col gap-3.5" key={item.title}>
                <Graphic />
                <figcaption className="flex flex-col gap-1">
                  <h3 className="font-bold text-lg leading-tight">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);
