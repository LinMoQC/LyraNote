import { View, Text, FlatList, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { getHttpClient } from "@/lib/http-client";
import { createNotebookService } from "@lyranote/api-client";
import type { Notebook } from "@lyranote/types";
import { Colors, FontSize, Radius, Spacing } from "@/lib/theme";

export default function NotebooksScreen() {
  const qc = useQueryClient();

  const { data: notebooks = [], isLoading } = useQuery({
    queryKey: ["notebooks"],
    queryFn: async () => {
      const http = await getHttpClient();
      return createNotebookService(http).getNotebooks();
    },
  });

  const createNotebook = useMutation({
    mutationFn: async () => {
      const http = await getHttpClient();
      return createNotebookService(http).createNotebook("Untitled Notebook");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notebooks"] }),
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notebooks</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => createNotebook.mutate()}
          activeOpacity={0.7}
        >
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notebooks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <NotebookCard
            notebook={item}
            onPress={() => router.push(`/(app)/notebooks/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📓</Text>
              <Text style={styles.emptyText}>No notebooks yet</Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => createNotebook.mutate()}
              >
                <Text style={styles.createBtnText}>Create your first notebook</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </View>
  );
}

function NotebookCard({ notebook, onPress }: { notebook: Notebook; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardEmoji}>
        <Text style={styles.cardEmojiText}>{notebook.coverEmoji ?? "📓"}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{notebook.title}</Text>
        {notebook.description && (
          <Text style={styles.cardDesc} numberOfLines={1}>{notebook.description}</Text>
        )}
        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>{notebook.sourceCount} sources</Text>
          <Text style={styles.cardMetaDot}>·</Text>
          <Text style={styles.cardMetaText}>{notebook.wordCount.toLocaleString()} words</Text>
        </View>
      </View>
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
    paddingBottom: Spacing[4],
  },
  title: { fontSize: FontSize.xl, fontWeight: "700", color: Colors.text },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 20, lineHeight: 22 },
  list: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[6] },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing[3],
    alignItems: "center",
  },
  cardPressed: { opacity: 0.7 },
  cardEmoji: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmojiText: { fontSize: 22 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: FontSize.base, fontWeight: "600", color: Colors.text },
  cardDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  cardMeta: { flexDirection: "row", gap: Spacing[2], marginTop: 6 },
  cardMetaText: { fontSize: FontSize.xs, color: Colors.textDisabled },
  cardMetaDot: { fontSize: FontSize.xs, color: Colors.textDisabled },
  empty: { alignItems: "center", paddingTop: 80, gap: Spacing[3] },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: FontSize.base, color: Colors.textMuted },
  createBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    marginTop: Spacing[2],
  },
  createBtnText: { color: "#fff", fontSize: FontSize.sm, fontWeight: "600" },
});
