"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { cn } from "@/lib/utils"

// Values are "YYYY-MM-DD" strings, the same format <input type="date"> posts, so the
// server actions need no change. Calendar is Monday-first, Romanian, Europe/Bucharest "today".

const TZ = "Europe/Bucharest"
const WEEKDAYS = ["L", "Ma", "Mi", "J", "V", "S", "D"]
const MONTH_FMT = new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" })
const SHOW_FMT = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", year: "numeric" })

const pad = (n: number) => String(n).padStart(2, "0")
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null
}
const todayIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date())
const addDays = (v: string, n: number) => {
  const p = parse(v)!
  const d = new Date(Date.UTC(p.y, p.m, p.d + n))
  return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// 6 weeks x 7 days starting on the Monday on/before the 1st of the month.
function grid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1))
  const lead = (first.getUTCDay() + 6) % 7 // Monday = 0
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(year, month, 1 - lead + i))
    return { iso: iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), inMonth: d.getUTCMonth() === month, day: d.getUTCDate() }
  })
}

type DatePickerProps = {
  name?: string
  value?: string // controlled
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
  className?: string
  "aria-label"?: string
}

function DatePicker({ name, value: controlled, defaultValue = "", onValueChange, placeholder = "Alege data", required, disabled, id, className, ...rest }: DatePickerProps) {
  const [inner, setInner] = React.useState(defaultValue)
  const value = controlled ?? inner
  const [open, setOpen] = React.useState(false)
  const sel = parse(value)
  const today = todayIso()
  const start = sel ?? parse(today)!
  const [view, setView] = React.useState({ y: start.y, m: start.m })
  const [focus, setFocus] = React.useState(value || today)
  const field = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const form = field.current?.form
    if (!form || controlled !== undefined) return
    const reset = () => setInner(defaultValue)
    form.addEventListener("reset", reset)
    return () => form.removeEventListener("reset", reset)
  }, [controlled, defaultValue])

  function commit(next: string) {
    if (controlled === undefined) setInner(next)
    onValueChange?.(next)
    setOpen(false)
  }

  function openChanged(o: boolean) {
    if (o) {
      const s = parse(value) ?? parse(today)!
      setView({ y: s.y, m: s.m })
      setFocus(value || today)
    }
    setOpen(o)
  }

  function moveFocus(next: string) {
    const p = parse(next)!
    setFocus(next)
    setView({ y: p.y, m: p.m })
  }

  function onGridKey(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in step) {
      e.preventDefault()
      moveFocus(addDays(focus, step[e.key]))
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault()
      const p = parse(focus)!
      const t = new Date(Date.UTC(p.y, p.m + (e.key === "PageUp" ? -1 : 1), 1))
      const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
      moveFocus(iso(t.getUTCFullYear(), t.getUTCMonth(), Math.min(p.d, last)))
    }
  }

  // keep DOM focus on the keyboard-focused day while the popover is open
  const gridRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus()
  }, [open, focus, view])

  const shiftMonth = (n: number) => setView((v) => {
    const t = new Date(Date.UTC(v.y, v.m + n, 1))
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() }
  })

  const shown = sel ? SHOW_FMT.format(new Date(Date.UTC(sel.y, sel.m, sel.d, 12))) : ""
  const cells = grid(view.y, view.m)

  return (
    <div className="relative">
      {name && !required && <input ref={field} type="hidden" name={name} value={value} disabled={disabled} />}
      {/* required: an invisible real input, so the browser's own "fill this in" check still works */}
      {name && required && (
        <input
          ref={field}
          name={name}
          value={value}
          required
          tabIndex={-1}
          onChange={() => {}} // not readOnly: read-only inputs skip the browser's required check
          aria-hidden
          disabled={disabled}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      )}
      <PopoverPrimitive.Root open={open} onOpenChange={openChanged}>
        <PopoverPrimitive.Trigger
          id={id}
          disabled={disabled}
          aria-label={rest["aria-label"]}
          data-slot="date-picker-trigger"
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-base outline-none transition-colors md:text-sm",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-ring disabled:cursor-not-allowed disabled:opacity-50",
            !shown && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{shown || placeholder}</span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className="z-50 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <div className="flex">
                <NavButton label="Anul trecut" onClick={() => shiftMonth(-12)}><ChevronsLeft className="size-4" /></NavButton>
                <NavButton label="Luna trecută" onClick={() => shiftMonth(-1)}><ChevronLeft className="size-4" /></NavButton>
              </div>
              <p className="text-sm font-semibold capitalize" aria-live="polite">
                {MONTH_FMT.format(new Date(Date.UTC(view.y, view.m, 1, 12)))}
              </p>
              <div className="flex">
                <NavButton label="Luna viitoare" onClick={() => shiftMonth(1)}><ChevronRight className="size-4" /></NavButton>
                <NavButton label="Anul viitor" onClick={() => shiftMonth(12)}><ChevronsRight className="size-4" /></NavButton>
              </div>
            </div>
            <div ref={gridRef} role="grid" onKeyDown={onGridKey} className="grid grid-cols-7 gap-y-0.5 text-center">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-1 text-xs font-medium text-muted-foreground" aria-hidden>
                  {w}
                </span>
              ))}
              {cells.map((c) => {
                const selected = c.iso === value
                return (
                  <button
                    key={c.iso}
                    type="button"
                    role="gridcell"
                    data-date={c.iso}
                    aria-selected={selected}
                    tabIndex={c.iso === focus ? 0 : -1}
                    onClick={() => commit(c.iso)}
                    className={cn(
                      "mx-auto flex size-9 items-center justify-center rounded-md text-sm outline-none transition-colors md:size-8",
                      "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                      !c.inMonth && "text-muted-foreground/50",
                      c.iso === today && !selected && "border border-primary/60 font-semibold",
                      selected && "bg-primary text-primary-foreground hover:bg-primary"
                    )}
                  >
                    {c.day}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
              {required ? <span /> : (
                <button type="button" className="rounded px-3 py-2 text-muted-foreground hover:bg-accent md:px-2 md:py-1" onClick={() => commit("")}>
                  Șterge
                </button>
              )}
              <button type="button" className="rounded px-3 py-2 font-medium text-primary hover:bg-accent md:px-2 md:py-1" onClick={() => commit(today)}>
                Azi
              </button>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-7"
    >
      {children}
    </button>
  )
}

export { DatePicker }
