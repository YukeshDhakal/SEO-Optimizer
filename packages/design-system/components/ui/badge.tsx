import * as React from "react"
import { Slot as SlotPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@repo/design-system/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-none border-2 border-foreground px-2 py-0.5 text-xs font-bold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline:
          "bg-card text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        success: "bg-status-success-bg text-status-success-fg",
        info: "bg-status-info-bg text-status-info-fg",
        warning: "bg-status-warning-bg text-status-warning-fg",
        neutral: "bg-status-neutral-bg text-status-neutral-fg",
        error: "bg-status-error-bg text-status-error-fg",
        muted: "bg-status-muted-bg text-status-muted-fg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? SlotPrimitive.Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
