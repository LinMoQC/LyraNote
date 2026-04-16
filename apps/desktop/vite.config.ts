import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next-intl": path.resolve(__dirname, "./src/lib/next-intl-stub.ts"),
      "next/image": path.resolve(__dirname, "./src/lib/next-image-stub.tsx"),
      "next/dynamic": path.resolve(__dirname, "./src/lib/next-dynamic-stub.tsx"),
      "@nivo/calendar": path.resolve(__dirname, "./src/lib/stubs/nivo-calendar-stub.tsx"),
      "@excalidraw/excalidraw": path.resolve(__dirname, "./src/lib/stubs/excalidraw-stub.tsx"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}))
