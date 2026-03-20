"use client"

/**
 * @file 认证上下文 Provider
 * @description 管理全局用户认证状态：自动拉取当前用户信息、提供登出功能、
 *              通过 React Context 向子组件分发认证数据。
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { http } from "@/lib/http-client"
import { AUTH } from "@/lib/api-routes"

const AUTH_SKIP_PATHS = ["/login", "/setup"]

/** 已登录用户的基本信息 */
interface AuthUser {
  id: string
  username: string | null
  name: string | null
  email: string | null
  avatar_url: string | null
  has_google?: boolean
  has_github?: boolean
}

/** 认证上下文提供的值 */
interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  logout: async () => {},
  refetch: async () => {},
})

/**
 * 认证状态 Provider 组件
 * @description 应用启动时自动调用 /auth/me 获取用户信息，
 *              提供 logout（登出）和 refetch（刷新用户信息）方法。
 *              登出后通过 window.location 强制跳转以清除所有客户端状态。
 * @param children - 子组件树
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const initialLoadDone = useRef(false)

  const fetchUser = useCallback(async () => {
    try {
      const data = await http.get<AuthUser>(AUTH.ME, { skipToast: true })
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    const onAuthPage = AUTH_SKIP_PATHS.some((p) => window.location.pathname.startsWith(p))
    if (onAuthPage) {
      setIsLoading(false)
      return
    }
    fetchUser()
  }, [fetchUser])

  const logout = useCallback(async () => {
    try {
      await http.post(AUTH.LOGOUT)
    } finally {
      setUser(null)
      window.location.href = "/login"
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * 获取当前认证上下文
 * @returns {{ user, isLoading, logout, refetch }} 认证状态和操作方法
 */
export function useAuth() {
  return useContext(AuthContext)
}
