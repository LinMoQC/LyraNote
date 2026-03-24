import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getHttpClient } from "@/lib/http-client";
import { createNoteService, createNotebookService } from "@lyranote/api-client";
import type { Note } from "@lyranote/types";
import { Colors, FontSize, Radius, Spacing } from "@/lib/theme";

export default function NotebookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: notebook } = useQuery({
    queryKey: ["notebook", id],
    queryFn: async () => {
      const http = await getHttpClient();
      return createNotebookService(http).getNotebook(id);
    },
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["notes", id],
    queryFn: async () => {
      const http = await getHttpClient();
      return createNoteService(http).getNotes(id);
    },
  });

  const createNote = useMutation({
    mutationFn: async () => {
      const http = await getHttpClient();
      return createNoteService(http).createNote(id, "Untitled");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", id] }),
  });

  return (
    <View style={styles.container}>
      {/* 头部 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chatBtn}
          onPress={() => router.push(`/(app)/notebooks/${id}/chat`)}
        >
          <Text style={styles.chatBtnText}>💬 Chat</Text>
        </TouchableOpacity>
      </View>

      {/* 笔记本信息 */}
      {notebook && (
        <View style={styles.notebookInfo}>
          <Text style={styles.notebookEmoji}>{notebook.coverEmoji ?? "📓"}</Text>
          <Text style={styles.notebookTitle}>{notebook.title}</Text>
          {notebook.description && (
            <Text style={styles.notebookDesc}>{notebook.description}</Text>
          )}
        </View>
      )}

      {/* 笔记列表 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Notes</Text>
        <TouchableOpacity onPress={() => createNote.mutate()}>
          <Text style={styles.addText}>＋ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <NoteRow note={item} onPress={() => {}} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No notes yet. Create one!</Text>
          </View>
        }
      />
    </View>
  );
}

function NoteRow({ note, onPress }: { note: Note; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.noteRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Text style={styles.noteTitle} numberOfLines={1}>
        {note.title ?? "Untitled"}
      </Text>
      {note.contentText && (
        <Text style={styles.notePreview} numberOfLines={2}>
          {note.contentText}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing[5],
    paddingTop: 60,
    paddingBottom: Spacing[3],
  },
  backBtn: {},
  backText: { color: Colors.brand, fontSize: FontSize.base },
  chatBtn: {
    backgroundColor: Colors.brandSubtle,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  chatBtnText: { color: Colors.brand, fontSize: FontSize.sm, fontWeight: "600" },
  notebookInfo: { paddingHorizontal: Spacing[5], paddingBottom: Spacing[4] },
  notebookEmoji: { fontSize: 32, marginBottom: Spacing[2] },
  notebookTitle: { fontSize: FontSize["2xl"], fontWeight: "700", color: Colors.text },
  notebookDesc: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: "600", color: Colors.textMuted },
  addText: { fontSize: FontSize.sm, color: Colors.brand, fontWeight: "500" },
  list: { paddingBottom: Spacing[6] },
  noteRow: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  noteTitle: { fontSize: FontSize.base, fontWeight: "500", color: Colors.text },
  notePreview: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3, lineHeight: 16 },
  empty: { padding: Spacing[5] },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: "center" },
});
