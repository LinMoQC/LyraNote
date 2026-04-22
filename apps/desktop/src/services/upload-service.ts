import { getDesktopUploadService } from "@/lib/api-client"

export async function uploadTempFile(file: File) {
  const response = await getDesktopUploadService().uploadTemp(file)
  return response.id
}
