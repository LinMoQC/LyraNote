"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { LOGIN_PATH, LOGIN_ROUTE } from "@/lib/constants";
import { UnauthorizedError } from "@/lib/http-client";
import { getCurrentUser, logout, type AuthUser } from "@/services/auth-service";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logoutAndRedirect: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  logoutAndRedirect: async () => {},
  refetch: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const onLoginPage = pathname === LOGIN_ROUTE || pathname === LOGIN_PATH;
    if (onLoginPage) {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const logoutAndRedirect = useCallback(async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      window.location.href = LOGIN_PATH;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      logoutAndRedirect,
      refetch: fetchUser,
    }),
    [fetchUser, isLoading, logoutAndRedirect, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
