/**
 * @file AI 洞察、技能、记忆、任务服务
 */
import type { HttpClient } from "../lib/client";
import { INSIGHTS, SKILLS, MEMORY, TASKS, AI } from "../lib/routes";
import type { Artifact, Insight, Task } from "@lyranote/types";
import { mapArtifact } from "../lib/mappers";

export function createInsightService(http: HttpClient) {
  return {
    getInsights: (): Promise<Insight[]> => http.get<Insight[]>(INSIGHTS.LIST),
    readInsight: (id: string): Promise<void> => http.post(INSIGHTS.read(id)),
    readAll: (): Promise<void> => http.post(INSIGHTS.READ_ALL),
  };
}

export function createSkillService(http: HttpClient) {
  return {
    getSkills: (): Promise<unknown[]> => http.get<unknown[]>(SKILLS.LIST),
    toggleSkill: (name: string, enabled: boolean): Promise<void> =>
      http.put(SKILLS.toggle(name), { enabled }),
  };
}

export function createMemoryService(http: HttpClient) {
  return {
    getMemoryDoc: (): Promise<{ content: string }> =>
      http.get<{ content: string }>(MEMORY.DOC),
    updateMemoryDoc: (content: string): Promise<void> =>
      http.patch(MEMORY.DOC, { content }),
    getMemoryList: (): Promise<unknown[]> => http.get<unknown[]>(MEMORY.LIST),
    updateMemory: (id: string, payload: unknown): Promise<void> =>
      http.put(MEMORY.update(id), payload),
    deleteMemory: (id: string): Promise<void> => http.delete(MEMORY.delete(id)),
  };
}

export function createTaskService(http: HttpClient) {
  return {
    getTasks: (): Promise<Task[]> => http.get<Task[]>(TASKS.LIST),
    createTask: (payload: Partial<Task>): Promise<Task> =>
      http.post<Task>(TASKS.LIST, payload),
    updateTask: (id: string, payload: Partial<Task>): Promise<Task> =>
      http.patch<Task>(TASKS.detail(id), payload),
    deleteTask: (id: string): Promise<void> => http.delete(TASKS.detail(id)),
    runTask: (id: string): Promise<void> => http.post(TASKS.run(id)),
    getTaskRuns: (id: string): Promise<unknown[]> =>
      http.get<unknown[]>(TASKS.runs(id)),
  };
}

export function createAiService(http: HttpClient) {
  return {
    getArtifacts: async (notebookId: string): Promise<Artifact[]> => {
      const data = await http.get<unknown[]>(AI.artifacts(notebookId));
      return (data as Record<string, unknown>[]).map(mapArtifact);
    },

    generateArtifact: (notebookId: string, type: string): Promise<Artifact> =>
      http.post<Artifact>(AI.generateArtifact(notebookId), { type }),

    getSuggestions: (notebookId?: string): Promise<string[]> =>
      http.get<string[]>(AI.SUGGESTIONS, {
        params: notebookId ? { notebook_id: notebookId } : undefined,
      }),

    getContextGreeting: (notebookId: string): Promise<{ greeting: string }> =>
      http.get<{ greeting: string }>(AI.contextGreeting(notebookId)),

    polishText: (
      text: string,
      instruction: string,
      signal?: AbortSignal
    ): Promise<Response> =>
      http.stream(AI.POLISH, { text, instruction }, { signal }),

    createDeepResearch: (query: string, notebookId?: string): Promise<{ task_id: string }> =>
      http.post<{ task_id: string }>(AI.DEEP_RESEARCH, {
        query,
        ...(notebookId ? { notebook_id: notebookId } : {}),
      }),

    getDeepResearchStatus: (taskId: string): Promise<unknown> =>
      http.get(AI.deepResearchStatus(taskId)),
  };
}
