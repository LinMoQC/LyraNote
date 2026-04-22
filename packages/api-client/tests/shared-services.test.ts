import { beforeEach, describe, expect, it, vi } from "vitest";

import { createConfigService } from "../src/services/config";
import { createMemoryService } from "../src/services/memory";
import { createSkillService } from "../src/services/skills";
import { createMcpService } from "../src/services/mcp";
import { createUploadService } from "../src/services/upload";
import type { HttpClient } from "../src/lib/client";

describe("shared service factories", () => {
  const http = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    fetchJson: vi.fn(),
  } as unknown as HttpClient;

  beforeEach(() => {
    vi.mocked(http.get).mockReset();
    vi.mocked(http.post).mockReset();
    vi.mocked(http.patch).mockReset();
    vi.mocked(http.put).mockReset();
    vi.mocked(http.delete).mockReset();
    vi.mocked(http.fetchJson).mockReset();
  });

  it("routes config methods to stable endpoints", async () => {
    const service = createConfigService(http);
    vi.mocked(http.get).mockResolvedValue({ llm_model: "gpt-4o" });
    vi.mocked(http.patch).mockResolvedValue(undefined);
    vi.mocked(http.post).mockResolvedValue({ ok: true, model: "gpt-4o", message: "ok" });

    await expect(service.getConfig()).resolves.toEqual({ llm_model: "gpt-4o" });
    await expect(service.updateConfig({ llm_model: "gpt-5.4" })).resolves.toBeUndefined();
    await expect(service.testUtilityLlmConnection()).resolves.toEqual({
      ok: true,
      model: "gpt-4o",
      message: "ok",
    });

    expect(http.get).toHaveBeenCalledWith("/config");
    expect(http.patch).toHaveBeenCalledWith("/config", { data: { llm_model: "gpt-5.4" } });
    expect(http.post).toHaveBeenCalledWith("/config/test-utility-llm");
  });

  it("maps memory, skill, and mcp payloads correctly", async () => {
    vi.mocked(http.get)
      .mockResolvedValueOnce({ content_md: "# memory", updated_at: null })
      .mockResolvedValueOnce({
        preference: [],
        fact: [],
        skill: [],
      })
      .mockResolvedValueOnce([
        {
          name: "skill-a",
          display_name: "Skill A",
          description: null,
          category: null,
          version: "1.0.0",
          is_builtin: true,
          is_enabled: true,
          always: false,
          requires_env: null,
          env_satisfied: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "mcp-1",
          name: "server-a",
          display_name: "Server A",
          transport: "http",
          command: null,
          args: null,
          env_vars: null,
          url: "https://example.com",
          headers: null,
          is_enabled: true,
          discovered_tools: null,
          tools_discovered_at: null,
          created_at: "2026-04-17T00:00:00Z",
          updated_at: "2026-04-17T00:00:00Z",
        },
      ]);
    vi.mocked(http.put).mockResolvedValue(undefined);
    vi.mocked(http.post).mockResolvedValue({ ok: true, tools: [], error: null });

    const memory = createMemoryService(http);
    const skills = createSkillService(http);
    const mcp = createMcpService(http);

    await expect(memory.getMemoryDoc()).resolves.toEqual({ content_md: "# memory", updated_at: null });
    await expect(memory.getMemories()).resolves.toEqual({ preference: [], fact: [], skill: [] });
    await expect(skills.getSkills()).resolves.toEqual([
      expect.objectContaining({
        displayName: "Skill A",
        isEnabled: true,
      }),
    ]);
    await expect(mcp.listMcpServers()).resolves.toEqual([
      expect.objectContaining({
        displayName: "Server A",
        isEnabled: true,
      }),
    ]);

    await memory.backfillMemory();
    await skills.toggleSkill("skill-a", false);
    await mcp.testMcpServer("mcp-1");

    expect(http.post).toHaveBeenNthCalledWith(1, "/memory/backfill");
    expect(http.put).toHaveBeenCalledWith("/skills/skill-a", { is_enabled: false });
    expect(http.post).toHaveBeenNthCalledWith(2, "/mcp/servers/mcp-1/test", {});
  });

  it("unwraps temp upload results via fetchJson", async () => {
    const service = createUploadService(http);
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    vi.mocked(http.fetchJson).mockResolvedValue({
      id: "file-1",
      storage_key: "temp/u/test.txt",
      filename: "test.txt",
      content_type: "text/plain",
      size: 5,
    });

    await expect(service.uploadTemp(file)).resolves.toEqual({
      id: "file-1",
      storage_key: "temp/u/test.txt",
      filename: "test.txt",
      content_type: "text/plain",
      size: 5,
    });
    expect(http.fetchJson).toHaveBeenCalledWith(
      "/uploads/temp",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });
});
