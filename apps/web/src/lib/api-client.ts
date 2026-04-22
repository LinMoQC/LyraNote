import {
  createConfigService,
  createHttpClient,
  createMcpService,
  createMemoryService,
  createSourceService,
  createSkillService,
} from "@lyranote/api-client"

import { INTERNAL_API_BASE } from "@/lib/constants"
import { notifyError } from "@/lib/notify"
import {
  handleNotConfigured,
  handleUnauthorized,
} from "@/lib/request-error"

const webApiClient = createHttpClient({
  baseURL: INTERNAL_API_BASE,
  getToken: () => null,
  withCredentials: true,
  credentials: "include",
  onUnauthorized: handleUnauthorized,
  onNotConfigured: handleNotConfigured,
  onError: (message) => notifyError(message),
})

export function getWebApiClient() {
  return webApiClient
}

export function getWebConfigService() {
  return createConfigService(getWebApiClient())
}

export function getWebMemoryService() {
  return createMemoryService(getWebApiClient())
}

export function getWebSkillService() {
  return createSkillService(getWebApiClient())
}

export function getWebMcpService() {
  return createMcpService(getWebApiClient())
}

export function getWebSourceService() {
  return createSourceService(getWebApiClient())
}
