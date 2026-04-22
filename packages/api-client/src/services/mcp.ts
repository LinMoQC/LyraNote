import type { HttpClient } from "../lib/client";
import { MCP } from "../lib/routes";

export interface McpServerDetail {
  id: string;
  name: string;
  displayName: string | null;
  transport: "stdio" | "sse" | "http";
  command: string | null;
  args: string[] | null;
  envVars: Record<string, string> | null;
  url: string | null;
  headers: Record<string, string> | null;
  isEnabled: boolean;
  discoveredTools: { name: string; description: string }[] | null;
  toolsDiscoveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpToolInfo {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface McpTestResult {
  ok: boolean;
  tools: McpToolInfo[];
  error: string | null;
}

export interface CreateMcpServerPayload {
  name: string;
  display_name?: string | null;
  transport: "stdio" | "sse" | "http";
  command?: string | null;
  args?: string[] | null;
  env_vars?: Record<string, string> | null;
  url?: string | null;
  headers?: Record<string, string> | null;
  is_enabled?: boolean;
}

export interface UpdateMcpServerPayload {
  display_name?: string | null;
  transport?: "stdio" | "sse" | "http";
  command?: string | null;
  args?: string[] | null;
  env_vars?: Record<string, string> | null;
  url?: string | null;
  headers?: Record<string, string> | null;
  is_enabled?: boolean;
}

interface RawMcpServer {
  id: string;
  name: string;
  display_name: string | null;
  transport: "stdio" | "sse" | "http";
  command: string | null;
  args: string[] | null;
  env_vars: Record<string, string> | null;
  url: string | null;
  headers: Record<string, string> | null;
  is_enabled: boolean;
  discovered_tools: { name: string; description: string }[] | null;
  tools_discovered_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapServer(raw: RawMcpServer): McpServerDetail {
  return {
    id: raw.id,
    name: raw.name,
    displayName: raw.display_name,
    transport: raw.transport,
    command: raw.command,
    args: raw.args,
    envVars: raw.env_vars,
    url: raw.url,
    headers: raw.headers,
    isEnabled: raw.is_enabled,
    discoveredTools: raw.discovered_tools,
    toolsDiscoveredAt: raw.tools_discovered_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function createMcpService(http: HttpClient) {
  return {
    listMcpServers: async (): Promise<McpServerDetail[]> => {
      const data = await http.get<RawMcpServer[]>(MCP.LIST);
      return data.map(mapServer);
    },
    createMcpServer: async (payload: CreateMcpServerPayload): Promise<McpServerDetail> => {
      const data = await http.post<RawMcpServer>(MCP.CREATE, payload);
      return mapServer(data);
    },
    updateMcpServer: async (
      id: string,
      payload: UpdateMcpServerPayload,
    ): Promise<McpServerDetail> => {
      const data = await http.put<RawMcpServer>(MCP.detail(id), payload);
      return mapServer(data);
    },
    deleteMcpServer: (id: string) => http.delete<void>(MCP.detail(id)),
    testMcpServer: (id: string) => http.post<McpTestResult>(MCP.test(id), {}),
  };
}

export type McpService = ReturnType<typeof createMcpService>;
