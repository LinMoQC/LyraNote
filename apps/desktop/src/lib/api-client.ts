import {
  createConfigService,
  createAuthService,
  createConversationService,
  createHttpClient,
  createMcpService,
  createMemoryService,
  createNotebookService,
  createNoteService,
  createSkillService,
  createSourceService,
  createUploadService,
  type HttpClient,
} from "@lyranote/api-client"

import { sessionClear } from "@/lib/desktop-bridge"
import { useAuthStore } from "@/store/use-auth-store"
import { useDesktopRuntimeStore } from "@/store/use-desktop-runtime-store"

let cachedBaseUrl = ""
let cachedClient: HttpClient | null = null

function getApiBaseUrl() {
  return (useDesktopRuntimeStore.getState().status?.api_base_url ?? "").replace(/\/$/, "")
}

function createDesktopHttpClient(baseURL: string) {
  return createHttpClient({
    baseURL,
    getToken: () => useAuthStore.getState().token,
    onUnauthorized: () => {
      useAuthStore.getState().clearAuth()
      void sessionClear()
    },
  })
}

export function getDesktopHttpClient() {
  const nextBaseUrl = getApiBaseUrl()
  if (!nextBaseUrl) {
    throw new Error("Desktop runtime is not ready")
  }
  if (!cachedClient || cachedBaseUrl !== nextBaseUrl) {
    cachedBaseUrl = nextBaseUrl
    cachedClient = createDesktopHttpClient(nextBaseUrl)
  }
  return cachedClient
}

export function getDesktopAuthService() {
  return createAuthService(getDesktopHttpClient())
}

export function getDesktopNotebookService() {
  return createNotebookService(getDesktopHttpClient())
}

export function getDesktopNoteService() {
  return createNoteService(getDesktopHttpClient())
}

export function getDesktopSourceService() {
  return createSourceService(getDesktopHttpClient())
}

export function getDesktopConversationService() {
  return createConversationService(getDesktopHttpClient())
}

export function getDesktopConfigService() {
  return createConfigService(getDesktopHttpClient())
}

export function getDesktopMemoryService() {
  return createMemoryService(getDesktopHttpClient())
}

export function getDesktopSkillService() {
  return createSkillService(getDesktopHttpClient())
}

export function getDesktopMcpService() {
  return createMcpService(getDesktopHttpClient())
}

export function getDesktopUploadService() {
  return createUploadService(getDesktopHttpClient())
}
