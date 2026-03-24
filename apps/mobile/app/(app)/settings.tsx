import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/use-auth-store";
import { clearToken, getServerUrl } from "@/lib/storage";
import { invalidateClient } from "@/lib/http-client";
import { Colors, FontSize, Radius, Spacing } from "@/lib/theme";
import { useEffect, useState } from "react";

export default function SettingsScreen() {
  const { user, clearAuth } = useAuthStore();
  const [serverUrl, setServerUrlDisplay] = useState("");

  useEffect(() => {
    getServerUrl().then(setServerUrlDisplay);
  }, []);

  const handleLogout = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await clearToken();
          invalidateClient();
          clearAuth();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* 用户信息 */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name ?? user?.username ?? "?")[0].toUpperCase()}</Text>
        </View>
        <View>
          <Text style={styles.profileName}>{user?.name ?? user?.username ?? "User"}</Text>
          {user?.email && <Text style={styles.profileEmail}>{user.email}</Text>}
        </View>
      </View>

      {/* 连接信息 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Server</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{serverUrl}</Text>
        </View>
      </View>

      {/* 危险操作 */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing[6] },
  header: { paddingHorizontal: Spacing[5], paddingTop: 60, paddingBottom: Spacing[4] },
  title: { fontSize: FontSize.xl, fontWeight: "700", color: Colors.text },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing[4],
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing[4],
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: FontSize.xl, color: Colors.brand, fontWeight: "700" },
  profileName: { fontSize: FontSize.base, fontWeight: "600", color: Colors.text },
  profileEmail: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  section: {
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[4],
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: "600",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing[2],
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowLabel: { fontSize: FontSize.sm, color: Colors.text },
  rowValue: { fontSize: FontSize.xs, color: Colors.textMuted, maxWidth: "60%" },
  logoutBtn: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: Radius.md,
    paddingVertical: Spacing[4],
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.2)",
  },
  logoutText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: "600" },
});
