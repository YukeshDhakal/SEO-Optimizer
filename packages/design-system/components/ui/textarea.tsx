import * as React from "react"

import { cn } from "@repo/design-system/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-foreground placeholder:text-muted-foreground focus-visible:shadow-[4px_4px_0_#2B44FF] aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-none border-[3px] bg-input px-3 py-2 text-base transition-[box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
