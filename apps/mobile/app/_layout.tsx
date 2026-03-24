import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/use-auth-store";
import { getToken } from "@/lib/storage";
import { getHttpClient } from "@/lib/http-client";
import { createAuthService } from "@lyranote/api-client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  const { setAuth, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    // 启动时验证 token
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) { clearAuth(); return; }

        const http = await getHttpClient();
        const authService = createAuthService(http);
        const me = await authService.getMe();
        setAuth({
          id: me.id,
          username: me.username,
          name: me.name,
          email: me.email,
          avatar_url: me.avatar_url,
        });
      } catch {
        clearAuth();
      }
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </QueryClientProvider>
  );
}
