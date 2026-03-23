"use client"

import { memo, useMemo, useState } from "react"
import { ArrowUpDown } from "lucide-react"
import { safeParseJSON } from "./utils"

interface RawTableData {
  columns?: string[]
  headers?: string[]
  rows?: unknown[]
  data?: unknown[]
}

function normalizeRows(columns: string[], rawRows: unknown[]): (string | number)[][] {
  return rawRows.map(row => {
    if (Array.isArray(row)) return row.map(c => (c == null ? "" : c))
    if (typeof row === "object" && row !== null) {
      const obj = row as Record<string, unknown>
      return columns.map(col => {
        const val = obj[col]
        return val == null ? "" : val as string | number
      })
    }
    return columns.map(() => "")
  })
}

function TableBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  if (isStreaming) {
    return (
      <div className="my-3 flex h-32 items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
        正在生成表格...
      </div>
    )
  }

  const raw = safeParseJSON<RawTableData>(code)
  const rawRows = raw?.rows ?? raw?.data
  const rawColumns = raw?.columns ?? raw?.headers

  if (!raw || !Array.isArray(rawRows) || rawRows.length === 0) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  // Normalize columns: could be string[] or object[] like [{title, dataIndex}]
  let columns: string[]
  if (Array.isArray(rawColumns) && rawColumns.length > 0) {
    columns = rawColumns.map(c =>
      typeof c === "string" ? c
      : typeof c === "object" && c !== null ? String((c as Record<string, unknown>).title ?? (c as Record<string, unknown>).label ?? (c as Record<string, unknown>).key ?? JSON.stringify(c))
      : String(c)
    )
  } else {
    // Infer columns from first row object keys
    const first = rawRows[0]
    if (typeof first === "object" && first !== null && !Array.isArray(first)) {
      columns = Object.keys(first as Record<string, unknown>)
    } else {
      return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>
    }
  }

  const rows = normalizeRows(columns, rawRows)

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) setSortAsc(!sortAsc)
    else { setSortCol(colIdx); setSortAsc(true) }
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sortedRows = useMemo(() => {
    if (sortCol === null) return rows
    return [...rows].sort((a, b) => {
      const va = a[sortCol]
      const vb = b[sortCol]
      if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [rows, sortCol, sortAsc])

  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-border/40">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-white/[0.04]">
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                onClick={() => handleSort(i)}
                className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-foreground/70 transition-colors hover:text-foreground/90"
              >
                <span className="inline-flex items-center gap-1">
                  {col}
                  <ArrowUpDown size={10} className="opacity-40" />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {sortedRows.map((row, ri) => (
            <tr key={ri} className="transition-colors hover:bg-white/[0.02]">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-foreground/80" title={String(cell)}>
                  <span className="line-clamp-3">{String(cell)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const TableBlock = memo(TableBlockInner)
