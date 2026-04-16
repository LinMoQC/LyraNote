/**
 * Type declarations for modules that are stubbed via Vite aliases
 * or not available in the desktop (Tauri/Vite) context.
 */

// next-intl stub — aliased to src/lib/next-intl-stub.ts
declare module "next-intl" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useTranslations<N extends string = string>(namespace: N): (...args: any[]) => string
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export default function dynamic<P = Record<string, any>>(
    loader: () => Promise<any>,
    options?: { ssr?: boolean; loading?: () => JSX.Element | null },
  ): ComponentType<P>
}

// Optional heavy dependencies — stubs so TS doesn't error on import
declare module "@nivo/calendar" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const ResponsiveCalendar: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const ResponsiveTimeRange: any
}

declare module "@excalidraw/excalidraw" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Excalidraw: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const exportToSvg: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ExcalidrawElement = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type AppState = any
}

declare module "markmap-lib" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class Transformer { transform(md: string): any; getUsedAssets(features: any): any }
}

declare module "markmap-view" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class Markmap { static create(el: SVGElement, opts?: any, data?: any): Markmap; fit(): void; setData(data: any): void; destroy(): void }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function loadCSS(styles: any[]): Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function loadJS(scripts: any[], opts?: any): Promise<void>
}
