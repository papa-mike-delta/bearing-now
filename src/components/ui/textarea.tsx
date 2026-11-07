"use client"

import * as React from "react"
import { TextArea as AriaTextArea } from "react-aria-components"

import { useThemeSelection } from "@/components/theme-selection"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const { base } = useThemeSelection()
  const shared = {
    "data-slot": "textarea",
    "data-theme-base": base,
    className: cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      ),
    ...props,
  }
  // radix-nova and base-nova textareas are both native <textarea>. Only the aria registry uses TextArea.
  if (base === "aria") return <AriaTextArea {...shared} />
  return <textarea {...shared} />
}

export { Textarea }
