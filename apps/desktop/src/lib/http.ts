import axios from "axios"
import { sessionClear } from "@/lib/desktop-bridge"
import { useAuthStore } from "@/store/use-auth-store"
import { useDesktopRuntimeStore } from "@/store/use-desktop-runtime-store"

export const http = axios.create({ timeout: 15000 })

http.interceptors.request.use((config) => {
  const baseUrl = useDesktopRuntimeStore.getState().status?.api_base_url
  const token = useAuthStore.getState().token
  if (baseUrl) config.baseURL = baseUrl
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      void sessionClear()
    }
    return Promise.reject(err)
  }
)
