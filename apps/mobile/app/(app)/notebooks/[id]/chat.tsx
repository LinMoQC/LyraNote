import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { getHttpClient } from "@/lib/http-client";
import { createConversationService, readSseStream, type SseChunk } from "@lyranote/api-client";
import { Colors, FontSize, Radius, Spacing } from "@/lib/theme";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export default function ChatScreen() {
  const { id: notebookId } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const convIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: input.trim() };
    const asstId = (Date.now() + 1).toString();

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: asstId, role: "assistant", content: "", isStreaming: true },
    ]);
    setInput("");
    setIsLoading(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const http = await getHttpClient();
      const svc = createConversationService(http);

      if (!convIdRef.current) {
        const conv = await svc.createConversation(notebookId, userMsg.content.slice(0, 60));
        convIdRef.current = conv.id;
      }

      const response = await svc.streamMessage(
        convIdRef.current,
        { content: userMsg.content },
        abort.signal
      );

      let fullContent = "";
      await readSseStream(response, (chunk: SseChunk) => {
        if (chunk.type === "token") {
          fullContent += chunk.content;
          setMessages((prev) =>
            prev.map((m) => (m.id === asstId ? { ...m, content: fullContent } : m))
          );
          listRef.current?.scrollToEnd({ animated: true });
        } else if (chunk.type === "done") {
          setMessages((prev) =>
            prev.map((m) => (m.id === asstId ? { ...m, isStreaming: false } : m))
          );
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstId
              ? { ...m, content: "Failed to get response.", isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, isLoading, notebookId]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* 头部 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Chat</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* 消息列表 */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => <MessageBubble message={item} />}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatEmoji}>✦</Text>
            <Text style={styles.emptyChatText}>Ask anything about this notebook</Text>
          </View>
        }
      />

      {/* 输入区 */}
      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask AI..."
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={2000}
        />
        {isLoading ? (
          <TouchableOpacity
            style={styles.stopBtn}
            onPress={() => {
              abortRef.current?.abort();
              setIsLoading(false);
              setMessages((prev) =>
                prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
              );
            }}
          >
            <Text style={styles.stopBtnText}>■</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim()}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowRight]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {message.content ? (
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {message.content}
          </Text>
        ) : message.isStreaming ? (
          <ActivityIndicator size="small" color={Colors.brand} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing[5],
    paddingTop: 60,
    paddingBottom: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeText: { fontSize: FontSize.base, color: Colors.textMuted, width: 32 },
  headerTitle: { fontSize: FontSize.base, fontWeight: "600", color: Colors.text },
  messageList: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    gap: Spacing[3],
    flexGrow: 1,
  },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowRight: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "80%",
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    minHeight: 36,
    justifyContent: "center",
  },
  bubbleUser: { backgroundColor: Colors.brand },
  bubbleAssistant: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  bubbleTextUser: { color: "#fff" },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: Spacing[2] },
  emptyChatEmoji: { fontSize: 32, color: Colors.brand, opacity: 0.4 },
  emptyChatText: { fontSize: FontSize.sm, color: Colors.textMuted },
  inputArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing[2],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    fontSize: FontSize.sm,
    color: Colors.text,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: "#fff", fontSize: 18, lineHeight: 22 },
  stopBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stopBtnText: { color: Colors.textMuted, fontSize: 12 },
});
