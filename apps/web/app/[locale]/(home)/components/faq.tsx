import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { Button } from "@repo/design-system/components/ui/button";
import type { Dictionary } from "@repo/internationalization";
import { PhoneCall } from "lucide-react";
import Link from "next/link";

interface FAQProps {
  dictionary: Dictionary;
}

export const FAQ = ({ dictionary }: FAQProps) => (
  <div className="w-full border-b-[3px] border-foreground py-16 lg:py-20">
    <div className="container mx-auto px-4">
      <div className="grid gap-10 lg:grid-cols-[420px_1fr]">
        <div className="flex flex-col gap-4">
          <h2 className="font-display max-w-xl text-3xl leading-[1.05] tracking-tight md:text-5xl">
            {dictionary.web.home.faq.title}
          </h2>
          <p className="max-w-md text-base leading-relaxed">
            {dictionary.web.home.faq.description}
          </p>
          <Button asChild className="mt-2 w-fit gap-2" variant="secondary">
            <Link href="/contact">
              {dictionary.web.home.faq.cta}
              <PhoneCall className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <Accordion className="w-full" collapsible type="single">
          {dictionary.web.home.faq.items.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  </div>
);
