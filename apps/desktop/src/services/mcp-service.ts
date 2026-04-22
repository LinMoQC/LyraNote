import type {
  CreateMcpServerPayload,
  McpServerDetail,
  UpdateMcpServerPayload,
} from "@lyranote/api-client"

import { getDesktopMcpService } from "@/lib/api-client"

export function getMcpServers() {
  return getDesktopMcpService().listMcpServers().then((servers) => servers.map(mapMcpServerToLegacy))
}

export function createMcpServer(payload: Record<string, unknown>) {
  return getDesktopMcpService()
    .createMcpServer(payload as unknown as CreateMcpServerPayload)
    .then(mapMcpServerToLegacy)
}

export function updateMcpServer(id: string, payload: Record<string, unknown>) {
  return getDesktopMcpService()
    .updateMcpServer(id, payload as unknown as UpdateMcpServerPayload)
    .then(mapMcpServerToLegacy)
}

export function deleteMcpServer(id: string) {
  return getDesktopMcpService().deleteMcpServer(id)
}

export function testMcpServer(id: string) {
  return getDesktopMcpService().testMcpServer(id)
}

function mapMcpServerToLegacy(server: McpServerDetail) {
  return {
    id: server.id,
    name: server.name,
    display_name: server.displayName,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    is_enabled: server.isEnabled,
    discovered_tools: server.discoveredTools,
  }
}
