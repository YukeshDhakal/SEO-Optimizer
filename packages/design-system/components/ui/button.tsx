import * as React from "react"
import { Slot as SlotPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@repo/design-system/lib/utils"

// Neobrutalism press-physics, read directly from the handoff's button
// treatments: a hard offset shadow that grows and shifts the button up-left
// on hover, then collapses down-right on press — a real "pushed a physical
// button" feel, not a color-opacity fade. `translate-x-0 translate-y-0` on
// the base state is required (not just omitted) so the hover/active
// transforms have something to transition *from* — Tailwind's `transition`
// utilities only animate a property that already has an explicit starting
// value.
const PRESS = "translate-x-0 translate-y-0 shadow-[4px_4px_0_#111] transition-[transform,box-shadow] duration-150 hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#111]";

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border-[3px] border-foreground text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/40 aria-invalid:border-destructive ${PRESS}`,
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "bg-card text-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        accent: "bg-accent text-accent-foreground",
        ghost:
          "border-transparent shadow-none hover:translate-x-0 hover:translate-y-0 hover:border-foreground hover:bg-accent hover:text-accent-foreground active:shadow-none",
        link: "border-transparent shadow-none hover:translate-x-0 hover:translate-y-0 active:shadow-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-12 px-7 text-base has-[>svg]:px-5",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
