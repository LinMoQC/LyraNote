import { Tabs, Redirect } from "expo-router";
import { View } from "react-native";
import { useAuthStore } from "@/store/use-auth-store";
import { Colors } from "@/lib/theme";

// 简单 SVG-like 图标用文字代替（避免引入图标包依赖）
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={{ opacity: focused ? 1 : 0.45, marginBottom: -2 }}>
      <View style={{ fontSize: 20 }}>
        {/* React Native 使用 Text 渲染 emoji */}
      </View>
    </View>
  );
}

export default function AppLayout() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.brand,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, marginBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="notebooks"
        options={{ title: "Notebooks", tabBarIcon: ({ focused }) => <TabIcon emoji="📓" focused={focused} /> }}
      />
      <Tabs.Screen
        name="knowledge"
        options={{ title: "Knowledge", tabBarIcon: ({ focused }) => <TabIcon emoji="🌐" focused={focused} /> }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: "Tasks", tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} /> }}
      />
    </Tabs>
  );
}
