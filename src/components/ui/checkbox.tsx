"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

type CheckboxProps = {
  name?: string
  value?: string // what is posted when checked (native default: "on")
  checked?: boolean // controlled
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
  "aria-label"?: string
}

// Themed checkbox. Posts exactly like a native one: a value only when checked.
// Put it inside a <label> and clicking the text toggles it (a button is labelable).
function Checkbox({ name, value = "on", checked: controlled, defaultChecked = false, onCheckedChange, disabled, id, className, ...rest }: CheckboxProps) {
  const [inner, setInner] = React.useState(defaultChecked)
  const checked = controlled ?? inner
  const field = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const form = field.current?.form
    if (!form || controlled !== undefined) return
    const reset = () => setInner(defaultChecked)
    form.addEventListener("reset", reset)
    return () => form.removeEventListener("reset", reset)
  }, [controlled, defaultChecked])

  return (
    <>
      {name && <input ref={field} type="hidden" name={name} value={value} disabled={disabled || !checked} />}
      <button
        type="button"
        role="checkbox"
        id={id}
        aria-checked={checked}
        aria-label={rest["aria-label"]}
        disabled={disabled}
        data-state={checked ? "checked" : "unchecked"}
        onClick={() => {
          const next = !checked
          if (controlled === undefined) setInner(next)
          onCheckedChange?.(next)
        }}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-[6px] md:size-4 md:rounded-[5px] border border-input bg-card shadow-xs outline-none transition-colors",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
          className
        )}
      >
        {checked && <Check className="size-3.5 md:size-3" strokeWidth={3} aria-hidden />}
      </button>
    </>
  )
}

export { Checkbox }
