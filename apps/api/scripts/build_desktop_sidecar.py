from __future__ import annotations

import argparse
import importlib.util
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
API_DIR = ROOT / "apps" / "api"
BINARIES_DIR = ROOT / "apps" / "desktop" / "src-tauri" / "binaries"
SIDECAR_BASENAME = "lyranote-api-desktop"
RUNTIME_DIR_NAME = f"{SIDECAR_BASENAME}-runtime"
MIN_PYTHON_VERSION = (3, 12)


def detect_target_triple() -> str:
    machine = platform.machine().lower()
    system = platform.system().lower()
    if system == "darwin":
        if machine in {"arm64", "aarch64"}:
            return "aarch64-apple-darwin"
        if machine in {"x86_64", "amd64"}:
            return "x86_64-apple-darwin"
    raise RuntimeError(
        f"Unsupported host for automatic target detection: system={system}, machine={machine}"
    )


def is_supported_python(version_info: tuple[int, ...] = sys.version_info[:3]) -> bool:
    return version_info >= MIN_PYTHON_VERSION


def sidecar_paths(output_dir: Path, target_triple: str) -> tuple[Path, Path]:
    return (
        output_dir / f"{SIDECAR_BASENAME}-{target_triple}",
        output_dir / RUNTIME_DIR_NAME,
    )


def wrapper_script_content() -> str:
    return f"""#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
BUNDLED_RUNTIME="$SCRIPT_DIR/../Resources/{RUNTIME_DIR_NAME}/{SIDECAR_BASENAME}"
LOCAL_RUNTIME="$SCRIPT_DIR/{RUNTIME_DIR_NAME}/{SIDECAR_BASENAME}"

if [ -x "$BUNDLED_RUNTIME" ]; then
  exec "$BUNDLED_RUNTIME" "$@"
fi

if [ -x "$LOCAL_RUNTIME" ]; then
  exec "$LOCAL_RUNTIME" "$@"
fi

echo "LyraNote desktop sidecar runtime is missing. Run: cd apps/api && python3 scripts/build_desktop_sidecar.py" >&2
echo "Checked: $BUNDLED_RUNTIME" >&2
echo "Checked: $LOCAL_RUNTIME" >&2
exit 127
"""


def write_wrapper(output_path: Path) -> None:
    output_path.write_text(wrapper_script_content(), encoding="utf-8")
    output_path.chmod(0o755)


def pyinstaller_command(entrypoint: Path, dist_dir: Path, work_dir: Path, spec_dir: Path) -> list[str]:
    return [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--contents-directory",
        "_internal",
        "--name",
        SIDECAR_BASENAME,
        "--distpath",
        str(dist_dir),
        "--workpath",
        str(work_dir),
        "--specpath",
        str(spec_dir),
        "--paths",
        str(API_DIR),
        "--collect-submodules",
        "app",
        "--collect-data",
        "app",
        "--hidden-import",
        "aiosqlite",
        str(entrypoint),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the bundled LyraNote desktop sidecar binary.")
    parser.add_argument("--target-triple", default="", help="Override the output target triple.")
    parser.add_argument(
        "--output-dir",
        default=str(BINARIES_DIR),
        help="Directory where the bundled binary should be written.",
    )
    args = parser.parse_args()

    target_triple = args.target_triple or detect_target_triple()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    wrapper_path, runtime_dir = sidecar_paths(output_dir, target_triple)

    if not is_supported_python():
        required = ".".join(str(part) for part in MIN_PYTHON_VERSION)
        current = ".".join(str(part) for part in sys.version_info[:3])
        print(
            f"Desktop sidecar must be built with Python {required}+; current interpreter is {current}.",
            file=sys.stderr,
        )
        return 1

    if importlib.util.find_spec("PyInstaller") is None:
        print(
            "PyInstaller is not installed. Install it with `python3 -m pip install pyinstaller` first.",
            file=sys.stderr,
        )
        return 1

    entrypoint = API_DIR / "app" / "desktop_main.py"
    build_dir = API_DIR / "tmp" / "pyinstaller-desktop"
    dist_dir = build_dir / "dist"
    work_dir = build_dir / "build"
    spec_dir = build_dir / "spec"
    build_dir.mkdir(parents=True, exist_ok=True)

    command = pyinstaller_command(entrypoint, dist_dir, work_dir, spec_dir)

    env = os.environ.copy()
    env.setdefault("PYTHONPATH", str(API_DIR))
    env.setdefault("PYINSTALLER_CONFIG_DIR", str(build_dir / "cache"))
    subprocess.run(command, cwd=API_DIR, env=env, check=True)

    built_runtime_dir = dist_dir / SIDECAR_BASENAME
    built_binary = built_runtime_dir / SIDECAR_BASENAME
    if not built_binary.exists():
        raise FileNotFoundError(f"PyInstaller finished but binary was not found at {built_binary}")

    if runtime_dir.exists():
        shutil.rmtree(runtime_dir)
    shutil.copytree(built_runtime_dir, runtime_dir)
    (runtime_dir / SIDECAR_BASENAME).chmod(0o755)
    write_wrapper(wrapper_path)
    print(wrapper_path)
    print(runtime_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
