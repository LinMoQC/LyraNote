import type { UploadTempResult } from "@lyranote/types";

import type { HttpClient } from "../lib/client";
import { UPLOADS } from "../lib/routes";

export function createUploadService(http: HttpClient) {
  return {
    async uploadTemp(file: File): Promise<UploadTempResult> {
      const form = new FormData();
      form.append("file", file);
      return http.fetchJson<UploadTempResult>(UPLOADS.TEMP, {
        method: "POST",
        body: form,
      });
    },
  };
}

export type UploadService = ReturnType<typeof createUploadService>;
