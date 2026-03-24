import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useAuthStore } from "@/store/use-auth-store";
import { getHttpClient } from "@/lib/http-client";
import { createInsightService } from "@lyranote/api-client";
import { Colors, FontSize, Radius, Spacing } from "@/lib/theme";
import type { Insight } from "@lyranote/types";

export default function HomeScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const { data: insights = [], isRefreshing, refetch } = useQuery({
    queryKey: ["insights"],
    queryFn: async () => {
      const http = await getHttpClient();
      return createInsightService(http).getInsights();
    },
  });

  const readAll = useMutation({
    mutationFn: async () => {
      const http = await getHttpClient();
      return createInsightService(http).readAll();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insights"] }),
  });

  const unread = insights.filter((i) => !i.read);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.brand} />
      }
    >
      {/* 问候 */}
      <View style={styles.greetingArea}>
        <Text style={styles.greeting}>
          Good {getTimeOfDay()},{" "}
          <Text style={styles.greetingName}>{user?.name ?? "there"}</Text>
        </Text>
        <Text style={styles.greetingSub}>Here's what's on your mind today</Text>
      </View>

      {/* 快速操作 */}
      <View style={styles.quickActions}>
        <QuickAction
          emoji="📓"
          label="Notebooks"
          onPress={() => router.push("/(app)/notebooks")}
        />
        <QuickAction
          emoji="💬"
          label="New Chat"
          onPress={() => router.push("/(app)/notebooks")}
        />
        <QuickAction
          emoji="🌐"
          label="Knowledge"
          onPress={() => router.push("/(app)/knowledge")}
        />
      </View>

      {/* AI 洞察 */}
      {unread.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>✦ AI Insights</Text>
            <TouchableOpacity onPress={() => readAll.mutate()}>
              <Text style={styles.sectionAction}>Mark all read</Text>
            </TouchableOpacity>
          </View>
          {unread.slice(0, 5).map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>
      )}

      {unread.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>✦</Text>
          <Text style={styles.emptyText}>No new insights yet</Text>
          <Text style={styles.emptySubText}>
            Start chatting with your notebooks to generate insights
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function QuickAction({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.quickActionEmoji}>{emoji}</Text>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightDot} />
      <Text style={styles.insightContent}>{insight.content}</Text>
    </View>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingTop: 60, paddingHorizontal: Spacing[5], paddingBottom: Spacing[6] },
  greetingArea: { marginBottom: Spacing[5] },
  greeting: { fontSize: FontSize.xl, fontWeight: "700", color: Colors.text },
  greetingName: { color: Colors.brand },
  greetingSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  quickActions: {
    flexDirection: "row",
    gap: Spacing[3],
    marginBottom: Spacing[5],
  },
  quickAction: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: "center",
    gap: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickActionEmoji: { fontSize: 24 },
  quickActionLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: "500" },
  section: { marginBottom: Spacing[5] },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing[3],
  },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: "600", color: Colors.text },
  sectionAction: { fontSize: FontSize.xs, color: Colors.brand },
  insightCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing[4],
    marginBottom: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    gap: Spacing[3],
    alignItems: "flex-start",
  },
  insightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand,
    marginTop: 5,
    shrink: 0,
  } as any,
  insightContent: { flex: 1, fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: Spacing[2],
  },
  emptyEmoji: { fontSize: 32, color: Colors.brand, opacity: 0.4 },
  emptyText: { fontSize: FontSize.base, color: Colors.textMuted, fontWeight: "500" },
  emptySubText: { fontSize: FontSize.xs, color: Colors.textDisabled, textAlign: "center", maxWidth: 240 },
});
