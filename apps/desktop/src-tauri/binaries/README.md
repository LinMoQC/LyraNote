Place bundled desktop sidecar files in this directory before running `tauri build`.

The build script generates:

- A thin shell wrapper that follows Tauri's `externalBin` target-triple convention.
- A PyInstaller onedir runtime copied into `lyranote-api-desktop-runtime/`, which Tauri
  bundles as an app resource.

Expected wrapper filenames:

- `lyranote-api-desktop-aarch64-apple-darwin`
- `lyranote-api-desktop-x86_64-apple-darwin`

Expected runtime directory:

- `lyranote-api-desktop-runtime/lyranote-api-desktop`

You can build the current host binary with:

```bash
cd /Users/kaihuang/Desktop/graduation-project/LyraNote/apps/api
python3 scripts/build_desktop_sidecar.py
```
