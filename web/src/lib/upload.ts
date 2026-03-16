/**
 * @file 文件上传工具
 * @description 基于 XMLHttpRequest 实现带进度回调的文件上传。
 *              fetch API 不支持上传进度监听，因此此处使用 XHR。
 */
import { authHeaderFromCookie } from "@/lib/request-error"
import { UPLOADS } from "@/lib/api-routes"
import { http } from "@/lib/http-client"

/** 上传成功后服务端返回的文件元信息 */
export interface UploadResult {
  id: string
  storage_key: string
  filename: string
  content_type: string
  size: number
}

/**
 * 上传文件并实时追踪上传进度
 * @param file - 要上传的文件对象
 * @param onProgress - 进度回调函数，参数为百分比（0~100）
 * @param signal - 可选的 AbortSignal，用于取消上传
 * @returns 上传成功后的文件元信息
 * @throws 401 时抛出 Unauthorized 错误
 */
export function uploadWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const url = http.url(UPLOADS.TEMP)

    xhr.open("POST", url)
    xhr.withCredentials = true

    const auth = authHeaderFromCookie()
    if (auth.Authorization) {
      xhr.setRequestHeader("Authorization", auth.Authorization)
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText)
          // Unwrap { code, data, message } envelope if present
          const result = body?.code === 0 && body?.data ? body.data : body
          resolve(result as UploadResult)
        } catch {
          reject(new Error("Invalid response from upload endpoint"))
        }
      } else if (xhr.status === 401) {
        reject(new Error("Unauthorized"))
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"))

    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        reject(new DOMException("Aborted", "AbortError"))
        return
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true })
    }

    const form = new FormData()
    form.append("file", file)
    xhr.send(form)
  })
}
