import axios from "axios"
import { useServerStore } from "@/store/use-server-store"
import { useAuthStore } from "@/store/use-auth-store"

export const http = axios.create({ timeout: 15000 })

http.interceptors.request.use((config) => {
  const baseUrl = useServerStore.getState().baseUrl
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
    }
    return Promise.reject(err)
  }
)
