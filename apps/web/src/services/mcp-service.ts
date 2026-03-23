import { http } from "@/lib/http-client";
import { MCP } from "@/lib/api-routes";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MCPServer {
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

export interface MCPToolInfo {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface MCPTestResult {
  ok: boolean;
  tools: MCPToolInfo[];
  error: string | null;
}

export interface CreateMCPServerPayload {
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

export interface UpdateMCPServerPayload {
  display_name?: string | null;
  transport?: "stdio" | "sse" | "http";
  command?: string | null;
  args?: string[] | null;
  env_vars?: Record<string, string> | null;
  url?: string | null;
  headers?: Record<string, string> | null;
  is_enabled?: boolean;
}

// ── Raw API shape ─────────────────────────────────────────────────────────────

interface RawMCPServer {
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

function mapServer(raw: RawMCPServer): MCPServer {
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

// ── API functions ─────────────────────────────────────────────────────────────

export async function listMCPServers(): Promise<MCPServer[]> {
  const data = await http.get<RawMCPServer[]>(MCP.LIST);
  return data.map(mapServer);
}

export async function createMCPServer(payload: CreateMCPServerPayload): Promise<MCPServer> {
  const data = await http.post<RawMCPServer>(MCP.CREATE, payload);
  return mapServer(data);
}

export async function updateMCPServer(
  id: string,
  payload: UpdateMCPServerPayload,
): Promise<MCPServer> {
  const data = await http.put<RawMCPServer>(MCP.detail(id), payload);
  return mapServer(data);
}

export async function deleteMCPServer(id: string): Promise<void> {
  await http.delete(MCP.detail(id));
}

export async function testMCPServer(id: string): Promise<MCPTestResult> {
  return await http.post<MCPTestResult>(MCP.test(id), {});
}
