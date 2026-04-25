import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import createNextIntlPlugin from "next-intl/plugin";
import {
  createLocatorTurbopackRules,
  createLocatorWebpackRule,
} from "./config/locator-build-config.mjs";

// Patch solid-js/web to ensure setStyleProperty is available.
// @locator/runtime 0.5.1 imports setStyleProperty from solid-js/web; this
// export is only present in the browser build (web.js), not the server build
// (server.js) that Node.js resolution picks by default. We alias solid-js/web
// to a shim that explicitly re-exports from the browser build.
const __configDir = path.dirname(fileURLToPath(import.meta.url));

// Walk pnpm's virtual store to find the highest solid-js version that has
// the browser build.  Falls back gracefully if the store isn't present.
const pnpmStore = path.join(__configDir, "../..", "node_modules", ".pnpm");
let solidWebBrowserPath = null;
if (fs.existsSync(pnpmStore)) {
  const entries = fs.readdirSync(pnpmStore).filter((e) => e.startsWith("solid-js@"));
  // Sort descending so we pick the highest available version first
  entries.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const entry of entries) {
    const candidate = path.join(pnpmStore, entry, "node_modules", "solid-js", "web", "dist", "web.js");
    if (fs.existsSync(candidate)) {
      solidWebBrowserPath = candidate;
      break;
    }
  }
}

const solidWebShimPath = path.join(__configDir, "config/solid-js-web-shim.mjs");

if (solidWebBrowserPath) {
  // Re-export from the browser build which exports setStyleProperty.
  fs.writeFileSync(
    solidWebShimPath,
    `export * from ${JSON.stringify(solidWebBrowserPath)};\n`
  );
}

const locatorTurbopackRules = createLocatorTurbopackRules({
  dev: process.env.NODE_ENV === "development",
});

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Monorepo + pnpm: trace deps from repo root so standalone/node_modules is complete in Docker.
  outputFileTracingRoot: path.join(__configDir, "../.."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  // LocatorJS: only inject source metadata in dev, and keep SSR/client output aligned.
  webpack: (config, { dev }) => {
    const locatorRule = createLocatorWebpackRule({ dev });

    if (locatorRule) {
      config.module.rules.push(locatorRule);
    }

    // Alias solid-js/web to the shim so @locator/runtime gets setStyleProperty.
    config.resolve.alias["solid-js/web"] = solidWebShimPath;

    return config;
  },
  ...(locatorTurbopackRules
    ? {
        turbopack: {
          rules: locatorTurbopackRules,
        },
      }
    : {}),
};

export default withNextIntl(nextConfig);
