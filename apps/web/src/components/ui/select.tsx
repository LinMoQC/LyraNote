"use client"

import { cn } from "@/lib/utils"
import { AnimatePresence, m } from "framer-motion"
import { Check, ChevronDown } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { useEffect, useRef, useState } from "react"

// ── Sub-components (used only as data carriers, not rendered directly) ────────

export function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return <option value={value}>{children}</option>
}
SelectItem.displayName = "SelectItem"

export function SelectTrigger({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return <span>{placeholder}</span>
}

// ── Main Select ───────────────────────────────────────────────────────────────

interface SelectProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
  className?: string
  triggerClassName?: string
  placeholder?: string
}

export function Select({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className,
  triggerClassName,
  placeholder,
}: SelectProps) {
  const tc = useTranslations("common");
  const resolvedPlaceholder = placeholder ?? tc("selectPlaceholder");
  const [open, setOpen] = useState(false)
  const [internalValue, setInternalValue] = useState(defaultValue ?? "")
  const containerRef = useRef<HTMLDivElement>(null)

  const value = controlledValue !== undefined ? controlledValue : internalValue

  // Recursively collect <SelectItem> nodes — matched by displayName (survives minification)
  function extractOptions(nodes: React.ReactNode): { value: string; label: React.ReactNode }[] {
    const result: { value: string; label: React.ReactNode }[] = []
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      const type = child.type as { displayName?: string }
      const props = child.props as { value?: string; children?: React.ReactNode }
      if (type?.displayName === "SelectItem" && typeof props.value === "string") {
        result.push({ value: props.value, label: props.children })
      } else if (props.children) {
        result.push(...extractOptions(props.children))
      }
    })
    return result
  }
  const options = extractOptions(children)

  const selectedLabel = options.find((o) => o.value === value)?.label

  function handleSelect(val: string) {
    if (controlledValue === undefined) setInternalValue(val)
    onValueChange?.(val)
    setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm transition-colors",
          "hover:border-primary/50 focus:outline-none",
          open ? "border-primary ring-1 ring-primary/30" : "",
          !selectedLabel ? "text-muted-foreground/50" : "text-foreground",
          triggerClassName,
        )}
      >
        <span className="truncate">{selectedLabel ?? resolvedPlaceholder}</span>
        <m.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="ml-2 flex-shrink-0 text-muted-foreground"
        >
          <ChevronDown size={14} />
        </m.span>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/20"
          >
            <div className="max-h-52 overflow-y-auto py-1">
              {options.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={13} className="flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
