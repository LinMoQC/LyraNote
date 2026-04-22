/** Stub for markmap-view — not used in desktop app */

export const Markmap = {
  create(_svg: unknown, _opts?: unknown) {
    return { setData: () => undefined, fit: () => undefined }
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCSS(_styles: unknown): Promise<any> { return undefined }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadJS(_scripts: unknown, _opts?: unknown): Promise<any> { return undefined }
