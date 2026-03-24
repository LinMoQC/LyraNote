import { View, Text, StyleSheet, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getHttpClient } from "@/lib/http-client";
import { KNOWLEDGE_GRAPH } from "@lyranote/api-client";
import { Colors, FontSize, Radius, Spacing } from "@/lib/theme";

export default function KnowledgeScreen() {
  const { data } = useQuery({
    queryKey: ["knowledge-graph-global"],
    queryFn: async () => {
      const http = await getHttpClient();
      return http.get<{ nodes: Array<{ id: string; label: string; type: string }> }>(KNOWLEDGE_GRAPH.GLOBAL);
    },
  });

  const nodes = data?.nodes ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Knowledge Graph</Text>
        <Text style={styles.subtitle}>{nodes.length} entities</Text>
      </View>

      <FlatList
        data={nodes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.entityRow}>
            <View style={styles.entityBadge}>
              <Text style={styles.entityType}>{item.type}</Text>
            </View>
            <Text style={styles.entityLabel}>{item.label}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌐</Text>
            <Text style={styles.emptyText}>No knowledge graph data yet</Text>
            <Text style={styles.emptySubText}>Import sources and rebuild to generate entities</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing[5],
    paddingTop: 60,
    paddingBottom: Spacing[4],
  },
  title: { fontSize: FontSize.xl, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  list: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[6] },
  entityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  entityBadge: {
    backgroundColor: Colors.brandSubtle,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
  },
  entityType: { fontSize: FontSize.xs, color: Colors.brand, fontWeight: "500" },
  entityLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  empty: { alignItems: "center", paddingTop: 80, gap: Spacing[2] },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: FontSize.base, color: Colors.textMuted, fontWeight: "500" },
  emptySubText: { fontSize: FontSize.xs, color: Colors.textDisabled, textAlign: "center", maxWidth: 240 },
});
