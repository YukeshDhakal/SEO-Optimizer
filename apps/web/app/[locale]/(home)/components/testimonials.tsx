import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import type { Dictionary } from "@repo/internationalization";

interface TestimonialsProps {
  dictionary: Dictionary;
}

// No carousel/slider anywhere in the neobrutalism handoff — every section
// is a static bordered-card grid, so this drops the auto-scrolling
// Carousel in favour of one, matching that pattern.
export const Testimonials = ({ dictionary }: TestimonialsProps) => (
  <div className="w-full border-b-[3px] border-foreground py-16 lg:py-20">
    <div className="container mx-auto flex flex-col gap-9 px-4">
      <h2 className="font-display max-w-xl text-3xl leading-[1.02] tracking-tight md:text-5xl">
        {dictionary.web.home.testimonials.title}
      </h2>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {dictionary.web.home.testimonials.items.map((item) => (
          <div
            className="flex flex-col justify-between gap-5 border-[3px] border-foreground bg-card p-6 shadow-[6px_6px_0_#111]"
            key={item.title}
          >
            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-xl leading-tight">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {item.description}
              </p>
            </div>
            <div className="flex items-center gap-2.5 border-t-[3px] border-foreground pt-4 text-sm">
              <Avatar className="h-7 w-7 border-2 border-foreground">
                <AvatarImage src={item.author.image} />
                <AvatarFallback>??</AvatarFallback>
              </Avatar>
              <span className="font-bold">{item.author.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
