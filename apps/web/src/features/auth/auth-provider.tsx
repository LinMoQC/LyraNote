"use client"

/**
 * @file 认证上下文 Provider
 * @description 管理全局用户认证状态：自动拉取当前用户信息、提供登出功能、
 *              通过 React Context 向子组件分发认证数据。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
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

interface AuthMethods {
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const EMPTY_AUTH_METHODS: AuthMethods = {
  logout: async () => {},
  refetch: async () => {},
}

const AuthUserContext = createContext<AuthUser | null>(null)
const AuthIsLoadingContext = createContext(true)
const AuthMethodsContext = createContext<AuthMethods>(EMPTY_AUTH_METHODS)

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

  const methods = useMemo<AuthMethods>(() => ({
    logout,
    refetch: fetchUser,
  }), [logout, fetchUser])

  return (
    <AuthMethodsContext.Provider value={methods}>
      <AuthIsLoadingContext.Provider value={isLoading}>
        <AuthUserContext.Provider value={user}>
          {children}
        </AuthUserContext.Provider>
      </AuthIsLoadingContext.Provider>
    </AuthMethodsContext.Provider>
  )
}

export function useAuthUser() {
  return useContext(AuthUserContext)
}

export function useAuthIsLoading() {
  return useContext(AuthIsLoadingContext)
}

export function useAuthMethods() {
  return useContext(AuthMethodsContext)
}

/**
 * 获取当前认证上下文
 * @returns {{ user, isLoading, logout, refetch }} 认证状态和操作方法
 */
export function useAuth() {
  const user = useAuthUser()
  const isLoading = useAuthIsLoading()
  const { logout, refetch } = useAuthMethods()
  return { user, isLoading, logout, refetch } satisfies AuthContextValue
}
