/** Stub for markmap-lib — not used in desktop app */

export class Transformer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_md: string): { root: unknown; features: any } {
    return { root: null, features: {} }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUsedAssets(_features: unknown): { styles: any; scripts: any } {
    return { styles: null, scripts: null }
  }
}
