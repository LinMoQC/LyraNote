import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const basePath = process.env.MONITORING_BASE_PATH ?? "/ops";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  basePath,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  env: {
    NEXT_PUBLIC_MONITORING_BASE_PATH: basePath,
  },
};

export default nextConfig;
