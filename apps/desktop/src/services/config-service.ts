import type { AppConfigMap } from "@lyranote/api-client"

import { getDesktopConfigService } from "@/lib/api-client"

export function getConfig() {
  return getDesktopConfigService().getConfig()
}

export function updateConfig(data: Record<string, unknown>) {
  const patch = { ...data } as Partial<AppConfigMap> & { smtp_port?: string }
  if (typeof data.smtp_port === "number") {
    patch.smtp_port = String(data.smtp_port)
  }
  return getDesktopConfigService().updateConfig(patch)
}

export function testConfigEndpoint(
  endpoint: "llm" | "utility" | "embedding" | "reranker" | "email",
) {
  switch (endpoint) {
    case "llm":
      return getDesktopConfigService().testLlmConnection()
    case "utility":
      return getDesktopConfigService().testUtilityLlmConnection()
    case "embedding":
      return getDesktopConfigService().testEmbeddingConnection()
    case "reranker":
      return getDesktopConfigService().testRerankerConnection()
    case "email":
      return getDesktopConfigService().testEmailConnection()
  }
}
