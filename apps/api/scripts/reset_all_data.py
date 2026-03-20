"""
重置脚本：清空所有数据，回到全新安装状态。
运行后需要重启服务器，然后通过 /setup 页面重新初始化。

用法：
  cd api
  python scripts/reset_all_data.py

  # 跳过二次确认（CI / 演示用）：
  python scripts/reset_all_data.py --force
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# 确保能 import app.*
sys.path.insert(0, str(Path(__file__).parent.parent))


# ── 颜色输出 ────────────────────────────────────────────────────────────────

RED    = "\033[0;31m"
GREEN  = "\033[0;32m"
YELLOW = "\033[1;33m"
CYAN   = "\033[0;36m"
BOLD   = "\033[1m"
NC     = "\033[0m"

def info(msg: str)  -> None: print(f"{GREEN}[reset]{NC} {msg}")
def warn(msg: str)  -> None: print(f"{YELLOW}[warn]{NC}  {msg}")
def error(msg: str) -> None: print(f"{RED}[error]{NC} {msg}")
def step(msg: str)  -> None: print(f"{CYAN}  →{NC} {msg}")


# ── 数据库清理 ───────────────────────────────────────────────────────────────

async def clear_database() -> None:
    from sqlalchemy import text
    from app.database import AsyncSessionLocal

    # TRUNCATE ... CASCADE 一次搞定所有外键依赖
    tables = [
        "messages",
        "conversation_summaries",
        "conversations",
        "agent_reflections",
        "user_memories",
        "user_skill_configs",
        "artifacts",
        "notebook_summaries",
        "chunks",
        "sources",
        "notes",
        "notebooks",
        "agent_runs",
        "skill_installs",
        "users",
        "app_config",
    ]

    async with AsyncSessionLocal() as db:
        for table in tables:
            await db.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
            step(f"清空表 {table}")
        await db.commit()

    info("数据库已清空 ✓")


# ── MinIO / S3 存储清理 ──────────────────────────────────────────────────────

async def clear_storage() -> None:
    from app.config import settings

    if settings.storage_backend == "local":
        _clear_local_storage(settings.storage_local_path)
        return

    if settings.storage_backend not in ("minio", "s3", "oss", "r2"):
        warn(f"未知 storage_backend={settings.storage_backend!r}，跳过存储清理")
        return

    endpoint = settings.storage_s3_endpoint_url or None
    if not endpoint:
        warn("未配置 S3 endpoint，跳过存储清理")
        return

    try:
        import aioboto3
        from botocore.config import Config

        session = aioboto3.Session()
        cfg = Config(signature_version="s3v4", s3={"addressing_style": "path"})

        async with session.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.storage_s3_access_key,
            aws_secret_access_key=settings.storage_s3_secret_key,
            region_name=settings.storage_s3_region,
            config=cfg,
        ) as s3:
            deleted = 0
            paginator = s3.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=settings.storage_s3_bucket):
                objects = page.get("Contents", [])
                if not objects:
                    continue
                keys = [{"Key": o["Key"]} for o in objects]
                await s3.delete_objects(
                    Bucket=settings.storage_s3_bucket,
                    Delete={"Objects": keys},
                )
                deleted += len(keys)
                step(f"删除 {len(keys)} 个对象（共 {deleted}）")

        if deleted == 0:
            step("存储桶已是空的")
        info(f"MinIO 存储已清空，共删除 {deleted} 个文件 ✓")

    except Exception as exc:
        warn(f"存储清理失败（可在重启后手动处理）: {exc}")


def _clear_local_storage(path: str) -> None:
    import shutil
    storage_dir = Path(path)
    if storage_dir.exists():
        shutil.rmtree(storage_dir)
        storage_dir.mkdir(parents=True, exist_ok=True)
        info(f"本地存储已清空: {storage_dir} ✓")
    else:
        step("本地存储目录不存在，跳过")


# ── 本地 memory 文件清理 ──────────────────────────────────────────────────────

def clear_memory_files() -> None:
    import shutil
    from app.config import settings

    memory_dir = Path(settings.memory_dir) if settings.memory_dir else Path("./data/memory")
    if not memory_dir.is_absolute():
        memory_dir = Path(__file__).parent.parent / memory_dir

    if memory_dir.exists():
        shutil.rmtree(memory_dir)
        step(f"Memory 文件已清空: {memory_dir}")
    else:
        step("Memory 目录不存在，跳过")
    info("Memory 文件已清空 ✓")


# ── 加载 DB 配置（setup 已完成的情况下从 app_config 读）────────────────────────

async def load_db_config_for_storage() -> None:
    """启动时把 app_config 里的 storage 配置写入 settings，使 clear_storage 能读到正确值。"""
    try:
        from app.domains.setup.router import load_settings_from_db
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await load_settings_from_db(db)
    except Exception:
        pass  # 如果 app_config 已空或出错，使用 .env 里的默认值


# ── 主流程 ───────────────────────────────────────────────────────────────────

async def main() -> None:
    force = "--force" in sys.argv

    print()
    print(f"{BOLD}{RED}{'─' * 50}{NC}")
    print(f"{BOLD}{RED}  ⚠️  LyraNote 数据重置脚本{NC}")
    print(f"{BOLD}{RED}{'─' * 50}{NC}")
    print()
    print("  此脚本将执行以下操作：")
    print("    1. 清空所有数据库表（用户、笔记本、来源、对话…）")
    print("    2. 删除 MinIO / 本地存储中的所有文件")
    print("    3. 清空 Memory 文件")
    print()
    print(f"  {YELLOW}重置后需重启服务器，然后访问 /setup 重新初始化。{NC}")
    print()

    if not force:
        try:
            confirm = input(f"  确认要重置所有数据吗？[输入 yes 继续]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            info("已取消")
            return
        if confirm != "yes":
            info("已取消")
            return

    print()
    info("开始重置…")
    print()

    # 先加载 DB 里的存储配置（让 clear_storage 拿到正确凭证）
    await load_db_config_for_storage()

    await clear_database()
    await clear_storage()
    clear_memory_files()

    print()
    print(f"{BOLD}{GREEN}{'─' * 50}{NC}")
    print(f"{BOLD}{GREEN}  ✅ 重置完成！{NC}")
    print(f"{BOLD}{GREEN}{'─' * 50}{NC}")
    print()
    print("  下一步：")
    print("    1. 重启服务器：Ctrl+C → ./start.sh local")
    print("    2. 打开浏览器访问 http://localhost:3000/setup")
    print("    3. 完成初始化向导")
    print()


if __name__ == "__main__":
    asyncio.run(main())
