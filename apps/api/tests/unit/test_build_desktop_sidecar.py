from __future__ import annotations

import importlib.util
import stat
from pathlib import Path


def load_sidecar_script():
    script_path = Path(__file__).resolve().parents[2] / "scripts" / "build_desktop_sidecar.py"
    spec = importlib.util.spec_from_file_location("build_desktop_sidecar", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_sidecar_script_resolves_repo_root_and_output_paths() -> None:
    module = load_sidecar_script()
    repo_root = Path(__file__).resolve().parents[4]

    assert module.ROOT == repo_root
    assert module.API_DIR == repo_root / "apps" / "api"
    assert module.BINARIES_DIR == repo_root / "apps" / "desktop" / "src-tauri" / "binaries"
    assert module.SIDECAR_BASENAME == "lyranote-api-desktop"
    assert module.RUNTIME_DIR_NAME == "lyranote-api-desktop-runtime"
    assert module.MIN_PYTHON_VERSION == (3, 12)


def test_sidecar_script_requires_python_312_or_newer() -> None:
    module = load_sidecar_script()

    assert module.is_supported_python((3, 12, 0))
    assert module.is_supported_python((3, 13, 0))
    assert not module.is_supported_python((3, 11, 9))


def test_sidecar_paths_follow_tauri_external_bin_and_resource_layout(tmp_path: Path) -> None:
    module = load_sidecar_script()

    wrapper_path, runtime_dir = module.sidecar_paths(tmp_path, "aarch64-apple-darwin")

    assert wrapper_path == tmp_path / "lyranote-api-desktop-aarch64-apple-darwin"
    assert runtime_dir == tmp_path / "lyranote-api-desktop-runtime"


def test_write_wrapper_points_to_bundled_and_local_runtime(tmp_path: Path) -> None:
    module = load_sidecar_script()
    wrapper_path = tmp_path / "lyranote-api-desktop-aarch64-apple-darwin"

    module.write_wrapper(wrapper_path)

    wrapper = wrapper_path.read_text(encoding="utf-8")
    assert wrapper.startswith("#!/bin/sh")
    assert "../Resources/lyranote-api-desktop-runtime/lyranote-api-desktop" in wrapper
    assert "$SCRIPT_DIR/lyranote-api-desktop-runtime/lyranote-api-desktop" in wrapper
    assert 'exec "$BUNDLED_RUNTIME" "$@"' in wrapper
    assert 'exec "$LOCAL_RUNTIME" "$@"' in wrapper
    assert wrapper_path.stat().st_mode & stat.S_IXUSR


def test_pyinstaller_command_collects_dynamic_app_imports(tmp_path: Path) -> None:
    module = load_sidecar_script()

    command = module.pyinstaller_command(
        module.API_DIR / "app" / "desktop_main.py",
        tmp_path / "dist",
        tmp_path / "build",
        tmp_path / "spec",
    )

    assert "--onedir" in command
    assert "--collect-submodules" in command
    assert "app" in command
    assert "--collect-data" in command
    assert "aiosqlite" in command
