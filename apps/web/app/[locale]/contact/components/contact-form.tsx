"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Calendar } from "@repo/design-system/components/ui/calendar";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { cn } from "@repo/design-system/lib/utils";
import type { Dictionary } from "@repo/internationalization";
import { format } from "date-fns";
import { CalendarIcon, Check, MoveRight } from "lucide-react";
import { useState } from "react";

interface ContactFormProps {
  dictionary: Dictionary;
}

export const ContactForm = ({ dictionary }: ContactFormProps) => {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="w-full py-16 lg:py-24">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h1 className="font-display max-w-xl text-4xl leading-[1.02] tracking-tight md:text-6xl">
                {dictionary.web.contact.meta.title}
              </h1>
              <p className="max-w-sm text-lg leading-relaxed">
                {dictionary.web.contact.meta.description}
              </p>
            </div>
            {dictionary.web.contact.hero.benefits.map((benefit) => (
              <div
                className="flex flex-row items-start gap-4 text-left"
                key={benefit.title}
              >
                <Check aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <div className="flex flex-col gap-1">
                  <p className="font-bold">{benefit.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center">
            <div className="flex max-w-sm flex-col gap-4 border-[3px] border-foreground bg-card p-8 shadow-[8px_8px_0_#111]">
              <p className="font-display text-lg">{dictionary.web.contact.hero.form.title}</p>
              <div className="grid w-full max-w-sm items-center gap-1">
                <Label htmlFor="meeting-date">
                  {dictionary.web.contact.hero.form.date}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      className={cn(
                        "w-full max-w-sm justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                      variant="outline"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? (
                        format(date, "PPP")
                      ) : (
                        <span>{dictionary.web.contact.hero.form.date}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      initialFocus
                      mode="single"
                      onSelect={setDate}
                      selected={date}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid w-full max-w-sm items-center gap-1">
                <Label htmlFor="firstname">
                  {dictionary.web.contact.hero.form.firstName}
                </Label>
                <Input id="firstname" type="text" />
              </div>
              <div className="grid w-full max-w-sm items-center gap-1">
                <Label htmlFor="lastname">
                  {dictionary.web.contact.hero.form.lastName}
                </Label>
                <Input id="lastname" type="text" />
              </div>
              <Button className="w-full gap-4">
                {dictionary.web.contact.hero.form.cta}{" "}
                <MoveRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
