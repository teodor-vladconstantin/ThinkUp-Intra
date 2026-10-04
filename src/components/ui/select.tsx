"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type SelectOption = { value: string; label: string; disabled?: boolean }

// Radix forbids "" as an item value (it means "no selection"), but our forms use "" for
// "none" (no department, unassigned...). Map it to a sentinel inside, keep "" outside.
const EMPTY = "__empty__"

type SelectProps = {
  options: SelectOption[]
  name?: string // posts like a native <select>: a hidden input carries the value
  value?: string // controlled
  defaultValue?: string // uncontrolled
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
  className?: string
  "aria-label"?: string
  size?: "default" | "sm"
}

// A themed replacement for the browser's <select>. Drop-in for forms: it works inside
// <form action={...}> and plain GET forms, resets with the form, and is keyboard- and
// screen-reader-friendly (Radix). Only plain data crosses from server components.
function Select({
  options,
  name,
  value: controlled,
  defaultValue = "",
  onValueChange,
  placeholder = "Alege…",
  disabled,
  required,
  id,
  className,
  size = "default",
  ...rest
}: SelectProps) {
  const [inner, setInner] = React.useState(defaultValue)
  const value = controlled ?? inner
  const hidden = React.useRef<HTMLInputElement>(null)

  // form.reset() (e.g. after a successful submit) puts uncontrolled selects back to default.
  React.useEffect(() => {
    const form = hidden.current?.form
    if (!form || controlled !== undefined) return
    const reset = () => setInner(defaultValue)
    form.addEventListener("reset", reset)
    return () => form.removeEventListener("reset", reset)
  }, [controlled, defaultValue])

  const hasEmptyOption = options.some((o) => o.value === "")
  const radixValue = value === "" ? (hasEmptyOption ? EMPTY : "") : value

  return (
    <>
      {name && <input ref={hidden} type="hidden" name={name} value={value} disabled={disabled} />}
      <SelectPrimitive.Root
        value={radixValue}
        disabled={disabled}
        required={required}
        onValueChange={(v) => {
          const next = v === EMPTY ? "" : v
          if (controlled === undefined) setInner(next)
          onValueChange?.(next)
        }}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-label={rest["aria-label"]}
          data-slot="select-trigger"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs outline-none transition-colors",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60",
            "data-[state=open]:border-ring",
            size === "sm" ? "h-8 max-md:h-9" : "h-9 max-md:h-10",
            className
          )}
        >
          <span className="truncate">
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            collisionPadding={8}
            className="z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          >
            <SelectPrimitive.Viewport className="max-h-72 p-1">
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value || EMPTY}
                  value={o.value === "" ? EMPTY : o.value}
                  disabled={o.disabled}
                  className="relative flex cursor-pointer select-none items-center rounded-md py-2.5 pr-8 pl-2.5 text-sm outline-none md:py-1.5 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                    <Check className="size-4 text-primary" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </>
  )
}

export { Select }
