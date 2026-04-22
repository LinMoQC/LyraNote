# LyraNote Desktop

LyraNote Desktop is the Tauri + React desktop shell. It bundles the Vite frontend and a local API sidecar built from `apps/api/app/desktop_main.py`.

## Local Development

```bash
cd apps/desktop
pnpm dev
pnpm tauri dev
```

The Tauri dev config starts Vite on `http://localhost:1420`.

## Local macOS Packaging

Build the bundled API sidecar first, then build the Tauri app:

```bash
cd apps/api
./.venv/bin/python -m pip install -r requirements.txt -r requirements-dev.txt
./.venv/bin/python scripts/build_desktop_sidecar.py

cd ../desktop
pnpm tauri build
```

The sidecar script writes a target-triple wrapper to `src-tauri/binaries/` and a PyInstaller
onedir runtime to `src-tauri/binaries/lyranote-api-desktop-runtime/`. Tauri stores the wrapper in
`Contents/MacOS` and the runtime in `Contents/Resources` so the packaged app does not depend on
PyInstaller onefile extraction at startup.

Release bundles are written under:

```bash
apps/desktop/src-tauri/target/release/bundle/
```

Updater artifacts require the Tauri signing private key during build:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/lyranote-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
cd apps/desktop
pnpm tauri build
```

The public key is committed in `src-tauri/tauri.conf.json`. The matching private key generated for this setup is stored at `~/.tauri/lyranote-updater.key` on this machine. Keep it secret and backed up; losing it means already-installed apps cannot accept future updates signed by a different key.

## GitHub Release Packaging

Pushing a SemVer tag triggers `.github/workflows/release.yml`:

```bash
git tag v0.4.0
git push origin v0.4.0
```

The workflow:

1. Creates or refreshes a draft GitHub Release.
2. Builds macOS Apple Silicon (`aarch64-apple-darwin`) and Intel (`x86_64-apple-darwin`) desktop bundles.
3. Uploads `.dmg`, updater artifacts, `.sig` files, and `latest.json`.
4. Publishes `@lyranote/cli` to npm.
5. Publishes the draft Release only after all required jobs pass.

Required GitHub Secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: content of the Tauri updater private key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: empty for the current generated key, or the password if the key is regenerated with one.
- `NPM_TOKEN`: npm token for publishing `@lyranote/cli`.

## Installed App Updates

The app checks stable updates from:

```text
https://github.com/LinMoQC/LyraNote/releases/latest/download/latest.json
```

Users can open Settings -> Security -> Desktop Updates, check for a new version, download and install it, then relaunch the app to finish the update.

This first release path does not include Apple Developer ID signing or notarization. macOS may still require the user to trust the app manually after installation.
