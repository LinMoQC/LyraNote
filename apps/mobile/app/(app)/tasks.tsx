import { View, Text, StyleSheet } from "react-native";
import { Colors, FontSize, Spacing } from "@/lib/theme";

export default function TasksScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
      </View>
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>⚡</Text>
        <Text style={styles.emptyText}>Scheduled Tasks</Text>
        <Text style={styles.emptySubText}>Manage your automated AI tasks here</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing[5], paddingTop: 60, paddingBottom: Spacing[4] },
  title: { fontSize: FontSize.xl, fontWeight: "700", color: Colors.text },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing[2] },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: FontSize.base, color: Colors.textMuted, fontWeight: "500" },
  emptySubText: { fontSize: FontSize.xs, color: Colors.textDisabled, textAlign: "center" },
});
