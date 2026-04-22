import { QueryClientProvider } from "@tanstack/react-query"
import type { PropsWithChildren } from "react"

import { desktopQueryClient } from "@/lib/query-client"

export function DesktopQueryProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={desktopQueryClient}>
      {children}
    </QueryClientProvider>
  )
}
