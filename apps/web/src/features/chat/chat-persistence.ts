import type { ChatRole } from "@/lib/constants";

interface PersistedMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
}

const CHAT_ACTIVE_KEY = "lyranote-chat-active-conv";
const CHAT_CACHE_PREFIX = "lyranote-chat-cache:";

function cacheKey(conversationId: string) {
  return `${CHAT_CACHE_PREFIX}${conversationId}`;
}

export function saveActiveConversation(conversationId: string | null) {
  try {
    if (!conversationId) {
      localStorage.removeItem(CHAT_ACTIVE_KEY);
      return;
    }
    localStorage.setItem(CHAT_ACTIVE_KEY, conversationId);
  } catch {
    // ignore quota/storage errors
  }
}

export function loadActiveConversation(): string | null {
  try {
    return localStorage.getItem(CHAT_ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveConversationMessages(conversationId: string, messages: PersistedMessage[]) {
  try {
    localStorage.setItem(cacheKey(conversationId), JSON.stringify(messages));
  } catch {
    // ignore quota/storage errors
  }
}

export function loadConversationMessages(conversationId: string): PersistedMessage[] {
  try {
    const raw = localStorage.getItem(cacheKey(conversationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearConversationMessages(conversationId: string) {
  try {
    localStorage.removeItem(cacheKey(conversationId));
  } catch {
    // ignore
  }
}

export function clearAllConversationMessages() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(CHAT_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}
