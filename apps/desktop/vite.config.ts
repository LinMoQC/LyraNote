import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"


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
      "markmap-lib": path.resolve(__dirname, "./src/lib/stubs/markmap-lib-stub.ts"),
      "markmap-view": path.resolve(__dirname, "./src/lib/stubs/markmap-view-stub.ts"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@tiptap") || id.includes("lowlight")) {
            return "editor"
          }
          if (
            id.includes("react-markdown") ||
            id.includes("remark-gfm") ||
            id.includes("katex")
          ) {
            return "markdown"
          }
          if (
            id.includes("react-force-graph") ||
            id.includes("react-force-graph-2d")
          ) {
            return "viz-graph"
          }
          if (id.includes("react-wordcloud")) {
            return "viz-wordcloud"
          }
          if (id.includes("recharts")) {
            return "viz-charts"
          }
          if (id.includes("react-drawio")) {
            return "viz-diagram"
          }
          return undefined
        },
      },
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
