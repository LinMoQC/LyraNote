/**
 * Type declarations for modules that are stubbed via Vite aliases
 * or not available in the desktop (Tauri/Vite) context.
 */

// next-intl stub — aliased to src/lib/next-intl-stub.ts
declare module "next-intl" {
  export function useTranslations<N extends string = string>(namespace: N): (...args: unknown[]) => string
}

// next/image stub — aliased to src/lib/next-image-stub.tsx
declare module "next/image" {
  import type { ImgHTMLAttributes } from "react"
  interface ImageProps extends ImgHTMLAttributes<HTMLImageElement> {
    src: string
    alt: string
    width?: number
    height?: number
    unoptimized?: boolean
    fill?: boolean
    priority?: boolean
  }
  export default function Image(props: ImageProps): JSX.Element
}

// next/dynamic stub — aliased to src/lib/next-dynamic-stub.ts
declare module "next/dynamic" {
  import type { ComponentType } from "react"
  export default function dynamic<P = Record<string, unknown>>(
    loader: () => Promise<unknown>,
    options?: { ssr?: boolean; loading?: () => JSX.Element | null },
  ): ComponentType<P>
}

// Optional heavy dependencies — stubs so TS doesn't error on import
declare module "@nivo/calendar" {
  export const ResponsiveCalendar: unknown
  export const ResponsiveTimeRange: unknown
}

declare module "@excalidraw/excalidraw" {
  export const Excalidraw: unknown
  export const exportToSvg: unknown
  export type ExcalidrawElement = unknown
  export type AppState = unknown
}

declare module "markmap-lib" {
  export interface MarkmapTransformResult {
    root: unknown
    features: unknown
  }

  export interface MarkmapAssets {
    styles?: unknown[]
    scripts?: unknown[]
  }

  export class Transformer {
    transform(md: string): MarkmapTransformResult
    getUsedAssets(features: unknown): MarkmapAssets
  }
}

declare module "markmap-view" {
  export class Markmap {
    static create(el: SVGElement, opts?: unknown, data?: unknown): Markmap
    fit(): void
    setData(data: unknown): void
    destroy(): void
  }
  export function loadCSS(styles: unknown[]): Promise<void>
  export function loadJS(scripts: unknown[], opts?: unknown): Promise<void>
}
