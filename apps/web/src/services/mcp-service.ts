import type {
  CreateMcpServerPayload,
  McpServerDetail,
  McpTestResult,
  McpToolInfo,
  UpdateMcpServerPayload,
} from "@lyranote/api-client";

import { getWebMcpService } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MCPServer = McpServerDetail;
export type MCPToolInfo = McpToolInfo;
export type MCPTestResult = McpTestResult;
export type CreateMCPServerPayload = CreateMcpServerPayload;
export type UpdateMCPServerPayload = UpdateMcpServerPayload;

// ── API functions ─────────────────────────────────────────────────────────────

export async function listMCPServers(): Promise<MCPServer[]> {
  return getWebMcpService().listMcpServers();
}

export async function createMCPServer(payload: CreateMCPServerPayload): Promise<MCPServer> {
  return getWebMcpService().createMcpServer(payload);
}

export async function updateMCPServer(
  id: string,
  payload: UpdateMCPServerPayload,
): Promise<MCPServer> {
  return getWebMcpService().updateMcpServer(id, payload);
}

export async function deleteMCPServer(id: string): Promise<void> {
  await getWebMcpService().deleteMcpServer(id);
}

export async function testMCPServer(id: string): Promise<MCPTestResult> {
  return getWebMcpService().testMcpServer(id);
}
