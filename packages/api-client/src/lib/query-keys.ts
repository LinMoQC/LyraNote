type KeyParamValue =
  | string
  | number
  | boolean
  | null
  | undefined;

type KeyParams = Record<string, KeyParamValue>;

function normalizeParams<T extends object | undefined>(params?: T) {
  if (!params) return {} as Record<string, Exclude<KeyParamValue, undefined>>;

  const next = Object.entries(params as KeyParams)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<Record<string, Exclude<KeyParamValue, undefined>>>((acc, [key, value]) => {
      acc[key] = value as Exclude<KeyParamValue, undefined>;
      return acc;
    }, {});

  return next;
}

export interface ConversationListParams {
  notebookId?: string;
  scope?: "global" | "notebook";
  offset?: number;
  limit?: number;
}

export interface ConversationMessageParams {
  offset?: number;
  limit?: number;
}

export interface SourceListParams {
  notebookId?: string;
  scope?: "all" | "global" | "notebook";
  offset?: number;
  limit?: number;
  type?: string;
  search?: string;
}

export const lyraQueryKeys = {
  notebooks: {
    all: () => ["notebooks"] as const,
    list: () => ["notebooks", "list"] as const,
  },
  notes: {
    all: () => ["notes"] as const,
    list: (notebookId: string) => ["notes", "list", { notebookId }] as const,
  },
  conversations: {
    all: () => ["conversations"] as const,
    lists: () => ["conversations", "list"] as const,
    list: (params?: ConversationListParams) =>
      ["conversations", "list", normalizeParams(params)] as const,
    messagesRoot: () => ["conversations", "messages"] as const,
    messages: (conversationId: string, params?: ConversationMessageParams) =>
      ["conversations", "messages", conversationId, normalizeParams(params)] as const,
  },
  sources: {
    all: () => ["sources"] as const,
    lists: () => ["sources", "list"] as const,
    list: (params?: SourceListParams) =>
      ["sources", "list", normalizeParams(params)] as const,
    chunksRoot: () => ["sources", "chunks"] as const,
    chunks: (sourceId: string) => ["sources", "chunks", sourceId] as const,
  },
  config: {
    all: () => ["config"] as const,
    current: () => ["config", "current"] as const,
  },
  memory: {
    all: () => ["memory"] as const,
    entries: () => ["memory", "entries"] as const,
    doc: () => ["memory", "doc"] as const,
  },
  skills: {
    all: () => ["skills"] as const,
    list: () => ["skills", "list"] as const,
  },
  mcp: {
    all: () => ["mcp"] as const,
    servers: () => ["mcp", "servers"] as const,
  },
} as const;
