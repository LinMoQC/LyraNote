/**
 * @file 服务端认证工具
 * @description 用于 RSC（React Server Components）和 Server Actions 中的 API 调用。
 *              从 Next.js 请求的 Cookie 中读取认证 token，构造 Authorization 请求头，
 *              使后端 FastAPI 能够验证服务端渲染发起的请求。
 *
 * @example
 *   const headers = await getServerAuthHeaders()
 *   const res = await http.get("/notebooks", { headers })
 */
/**
 * 获取服务端请求的认证头
 * @returns 包含 Bearer token 的请求头对象，无 token 时返回空对象
 */
export async function getServerAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { cookies } = await import("next/headers")
    const cookieStore = await cookies()
    const token = cookieStore.get("lyranote_session")?.value
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {
    // Not in a Next.js server context (e.g., called client-side)
  }
  return {}
}
