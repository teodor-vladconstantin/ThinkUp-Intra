"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Always posts "#rrggbb" (what the zone_color_hex constraint accepts).
const PALETTE = [
  "#7C3AED", "#2563EB", "#0891B2", "#059669", "#65A30D", "#CA8A04",
  "#EA580C", "#DC2626", "#DB2777", "#9333EA", "#475569", "#0F766E",
]
const HEX = /^#[0-9a-fA-F]{6}$/

type Props = { name?: string; defaultValue?: string; "aria-label"?: string; className?: string }

function ColorPicker({ name, defaultValue = PALETTE[0], className, ...rest }: Props) {
  const [value, setValue] = React.useState(defaultValue)
  const [draft, setDraft] = React.useState(defaultValue)
  const field = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const form = field.current?.form
    if (!form) return
    const reset = () => {
      setValue(defaultValue)
      setDraft(defaultValue)
    }
    form.addEventListener("reset", reset)
    return () => form.removeEventListener("reset", reset)
  }, [defaultValue])

  const pick = (c: string) => {
    const hex = c.toUpperCase()
    setValue(hex)
    setDraft(hex)
  }

  return (
    <>
      {name && <input ref={field} type="hidden" name={name} value={value} />}
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger
          aria-label={rest["aria-label"] ?? "Culoare"}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs outline-none transition-colors",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-ring",
            className
          )}
        >
          <span className="size-5 rounded-full border border-black/10" style={{ background: value }} aria-hidden />
          <span className="font-mono text-xs uppercase">{value}</span>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="z-50 w-56 rounded-lg border border-border bg-popover p-3 shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          >
            <div className="grid grid-cols-6 gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => pick(c)}
                  className="flex size-7 items-center justify-center rounded-full border border-black/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ background: c }}
                >
                  {value.toUpperCase() === c && <Check className="size-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
            <label className="mt-3 grid gap-1 text-xs text-muted-foreground">
              Cod hex
              <input
                value={draft}
                maxLength={7}
                spellCheck={false}
                aria-invalid={!HEX.test(draft)}
                onChange={(e) => {
                  const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`
                  setDraft(v)
                  if (HEX.test(v)) setValue(v.toUpperCase())
                }}
                className="h-8 rounded-md border border-input bg-transparent px-2 font-mono text-sm uppercase text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
              />
            </label>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  )
}

export { ColorPicker }
