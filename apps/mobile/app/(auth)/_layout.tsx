import { Stack, Redirect } from "expo-router";
import { useAuthStore } from "@/store/use-auth-store";

export default function AuthLayout() {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Redirect href="/(app)" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
