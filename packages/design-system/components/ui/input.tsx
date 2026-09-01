import * as React from "react"

import { cn } from "@repo/design-system/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-accent selection:text-accent-foreground border-foreground h-10 w-full min-w-0 rounded-none border-[3px] bg-input px-3 py-1 text-base transition-[box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:shadow-[4px_4px_0_#2B44FF]",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
