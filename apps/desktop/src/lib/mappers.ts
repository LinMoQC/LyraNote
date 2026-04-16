/**
 * Desktop data mappers.
 * Wraps shared mappers from @lyranote/api-client and adds desktop-extra fields.
 */

import { mapSource as sharedMapSource } from "@lyranote/api-client"
export { mapNotebook, mapMessage, mapConversation } from "@lyranote/api-client"
import type { Source } from "@/types"

type Raw = Record<string, unknown>

export function mapSource(raw: Raw): Source {
  return {
    ...sharedMapSource(raw),
    url: (raw.url as string) ?? null,
    createdAt: (raw.created_at as string) ?? new Date().toISOString(),
  }
}
