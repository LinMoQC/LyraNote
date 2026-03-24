import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { MainLayout } from "@/layouts/main-layout";
import { LoginPage } from "@/pages/login";
import { getHttpClient } from "@/lib/http-client";
import { createAuthService } from "@lyranote/api-client";

export default function App() {
  const { isAuthenticated, setAuth, clearAuth } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // 验证本地存储的 token 是否仍有效
    if (!isAuthenticated) {
      setIsChecking(false);
      return;
    }
    const authService = createAuthService(getHttpClient());
    authService
      .getMe()
      .then((me) => {
        setAuth(
          { id: me.id, username: me.username, name: me.name, email: me.email, avatar_url: me.avatar_url },
          localStorage.getItem("lyranote_token") ?? ""
        );
      })
      .catch(() => clearAuth())
      .finally(() => setIsChecking(false));
  }, []);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-full bg-sidebar-bg">
        <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => window.location.reload()} />;
  }

  return <MainLayout />;
}
