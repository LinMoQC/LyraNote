import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/use-auth-store";
import { ActivityIndicator, View } from "react-native";
import { Colors } from "@/lib/theme";

export default function Index() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.brand} />
      </View>
    );
  }

  return <Redirect href={isAuthenticated ? "/(app)" : "/(auth)/login"} />;
}
