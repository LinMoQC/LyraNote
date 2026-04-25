"use client"

import { ChevronDown } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

interface FilterOption {
  label: string
  value: string
}

interface FilterField {
  key: string
  label: string
  options: FilterOption[]
}

export function FilterBar({ fields }: { fields: FilterField[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (!value) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`)
  }

  return (
    <div className="flex flex-wrap gap-3">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <label
            htmlFor={`filter-${field.key}`}
            className="text-[10px] uppercase tracking-[0.2em] text-muted/60"
          >
            {field.label}
          </label>
          <div className="relative">
            <select
              id={`filter-${field.key}`}
              value={searchParams.get(field.key) ?? ""}
              onChange={(event) => updateParam(field.key, event.target.value)}
              className="appearance-none cursor-pointer rounded-lg border border-white/[0.08] bg-black/40 py-1.5 pl-3 pr-8 text-sm text-foreground shadow-sm backdrop-blur outline-none transition-all duration-300 hover:bg-white/[0.04] focus:border-accent/50 focus:bg-white/[0.03] focus:shadow-[0_0_15px_rgba(20,184,166,0.1)]"
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted/50"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
