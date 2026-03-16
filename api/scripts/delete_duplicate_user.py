"""
删除重复用户（例如 GitHub 登录误创建的新用户）。
用法（在 api 目录下）: python -m scripts.delete_duplicate_user
"""
from __future__ import annotations

import asyncio
import os
import sys

# 确保从 api 目录运行时能 import app
_api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _api_dir not in sys.path:
    sys.path.insert(0, _api_dir)


async def main() -> None:
    from app.database import AsyncSessionLocal
    from app.models import User
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).order_by(User.created_at)
        )
        users = result.scalars().all()

    if not users:
        print("库里没有用户。")
        return
    if len(users) == 1:
        print("当前只有 1 个用户，无需删除。")
        return

    print("当前用户列表（保留原用户，删除 GitHub 误建的那个）：\n")
    for u in users:
        has_pw = "是" if u.password_hash else "否"
        has_gh = "是" if u.github_id else "否"
        print(f"  id:       {u.id}")
        print(f"  username: {u.username or '(无)'}")
        print(f"  email:    {u.email or '(无)'}")
        print(f"  有密码:   {has_pw}  有 GitHub: {has_gh}")
        print(f"  created:  {u.created_at}")
        print()

    raw = input("请输入要删除的用户的 id（完整 UUID，粘贴上面某行的 id）： ").strip()
    if not raw:
        print("未输入，已取消。")
        return
    target_id = raw

    # 再次确认
    target = next((u for u in users if str(u.id) == target_id), None)
    if not target:
        print("未找到该 id 对应用户，已取消。")
        return

    confirm = input(f"确认删除用户 {target.username or target.email or target.id}？(输入 yes 确认): ").strip().lower()
    if confirm != "yes":
        print("已取消。")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == target.id))
        user = result.scalar_one_or_none()
        if not user:
            print("用户已不存在，可能已被删除。")
            return
        await db.delete(user)
        await db.commit()
    print("已删除该用户（其笔记本等数据已随 CASCADE 一并删除）。")


if __name__ == "__main__":
    asyncio.run(main())
