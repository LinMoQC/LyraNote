import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/use-auth-store";
import { setToken, setServerUrl } from "@/lib/storage";
import { getHttpClient, invalidateClient } from "@/lib/http-client";
import { createAuthService } from "@lyranote/api-client";
import { Colors, FontSize, Radius, Spacing } from "@/lib/theme";

export default function LoginScreen() {
  const { setAuth } = useAuthStore();
  const [serverUrl, setServerUrlInput] = useState("http://localhost:8000/api/v1");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setError("");
    setIsLoading(true);

    try {
      await setServerUrl(serverUrl.trim());
      invalidateClient();
      const http = await getHttpClient();
      const authService = createAuthService(http);

      const tokenRes = await authService.login({ username, password });
      await setToken(tokenRes.access_token);

      const me = await authService.getMe();
      setAuth({ id: me.id, username: me.username, name: me.name, email: me.email, avatar_url: me.avatar_url });

      router.replace("/(app)");
    } catch {
      setError("Invalid credentials or server unreachable.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>✦</Text>
          </View>
          <Text style={styles.appName}>LyraNote</Text>
          <Text style={styles.appSubtitle}>Your AI-powered notebook</Text>
        </View>

        {/* 表单 */}
        <View style={styles.form}>
          <FormField
            label="Server URL"
            value={serverUrl}
            onChangeText={setServerUrlInput}
            placeholder="http://localhost:8000/api/v1"
            autoCapitalize="none"
            keyboardType="url"
          />
          <FormField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="admin"
            autoCapitalize="none"
          />
          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />

          {error !== "" && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.loginBtn, (isLoading || !username || !password) && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={isLoading || !username || !password}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.loginBtnText}>Sign in</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={fieldStyles.input}
        placeholderTextColor={Colors.textMuted}
        {...props}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  container: { marginBottom: Spacing[3] },
  label: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    color: Colors.text,
    fontSize: FontSize.sm,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[6],
  },
  logoArea: { alignItems: "center", marginBottom: 40 },
  logoIcon: {
    width: 60,
    height: 60,
    borderRadius: Radius.xl,
    backgroundColor: Colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoEmoji: { fontSize: 28, color: Colors.brand },
  appName: { color: Colors.text, fontSize: FontSize["2xl"], fontWeight: "700" },
  appSubtitle: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 4 },
  form: {},
  errorBox: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[3],
  },
  errorText: { color: Colors.error, fontSize: FontSize.xs },
  loginBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: Spacing[2],
  },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: { color: "#fff", fontSize: FontSize.sm, fontWeight: "600" },
});
