/**
 * Stub for next/dynamic in the desktop (Vite/Tauri) context.
 * Replaces Next.js dynamic imports with React.lazy (no SSR support needed in desktop).
 */
import { lazy, Suspense, type ComponentType, type ReactNode } from "react"

type DynamicOptions = {
  ssr?: boolean
  loading?: () => ReactNode
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function dynamic<P = Record<string, any>>(
  loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>,
  _opts?: DynamicOptions,
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const mod = await loader()
    // Support both default export and module-as-component
    if (typeof mod === "function" || (typeof mod === "object" && "$$typeof" in (mod as object))) {
      return { default: mod as ComponentType<P> }
    }
    return mod as { default: ComponentType<P> }
  })

  function DynamicComponent(props: P & Record<string, unknown>) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    )
  }

  return DynamicComponent as ComponentType<P>
}
