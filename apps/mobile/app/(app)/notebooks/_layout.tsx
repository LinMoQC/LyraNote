import { Stack } from "expo-router";

export default function NotebooksLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/chat" options={{ presentation: "modal" }} />
    </Stack>
  );
}
