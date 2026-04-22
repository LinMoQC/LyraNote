fn main() {
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo");
    let target = std::env::var("TARGET").expect("TARGET is set by cargo");
    let binaries_dir = std::path::Path::new(&manifest_dir).join("binaries");
    let sidecar_path = binaries_dir.join(format!("lyranote-api-desktop-{target}"));
    let runtime_dir = binaries_dir.join("lyranote-api-desktop-runtime");
    let runtime_path = runtime_dir.join("lyranote-api-desktop");
    if !sidecar_path.exists() {
        std::fs::create_dir_all(&binaries_dir).expect("failed to create Tauri binaries dir");
        std::fs::write(
            &sidecar_path,
            "#!/bin/sh\n\necho \"LyraNote desktop sidecar binary is missing. Run: cd apps/api && python3 scripts/build_desktop_sidecar.py\" >&2\nexit 1\n",
        )
        .expect("failed to write placeholder desktop sidecar");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            let permissions = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(&sidecar_path, permissions)
                .expect("failed to mark placeholder sidecar executable");
        }
    }
    if !runtime_path.exists() {
        std::fs::create_dir_all(&runtime_dir).expect("failed to create desktop sidecar runtime dir");
        std::fs::write(
            &runtime_path,
            "#!/bin/sh\n\necho \"LyraNote desktop sidecar runtime is missing. Run: cd apps/api && python3 scripts/build_desktop_sidecar.py\" >&2\nexit 1\n",
        )
        .expect("failed to write placeholder desktop sidecar runtime");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            let permissions = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(&runtime_path, permissions)
                .expect("failed to mark placeholder sidecar runtime executable");
        }
    }
    tauri_build::build()
}
