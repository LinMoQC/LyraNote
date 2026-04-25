from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.desktop_knowledge_service import DesktopKnowledgeService


class DesktopChatService:
    def __init__(self, db: AsyncSession, user_id: UUID | str) -> None:
        self.db = db
        self.user_id = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
        self.knowledge_service = DesktopKnowledgeService(db, self.user_id)

    @staticmethod
    def _compress_text(text: str, limit: int = 200) -> str:
        condensed = " ".join(text.split())
        if len(condensed) <= limit:
            return condensed
        return condensed[: limit - 3].rstrip() + "..."

    @staticmethod
    def _format_location(metadata: dict | None) -> str:
        if not metadata:
            return ""
        parts: list[str] = []
        page = metadata.get("page")
        if page:
            parts.append(f"第{page}页")
        heading = metadata.get("heading") or metadata.get("section")
        if heading:
            parts.append(str(heading))
        return f"（{' · '.join(parts)}）" if parts else ""

    async def answer_locally(
        self,
        *,
        query: str,
        notebook_id: UUID | str | None = None,
        source_id: UUID | str | None = None,
        limit: int = 5,
    ) -> dict:
        search = await self.knowledge_service.search_local(
            query=query,
            notebook_id=notebook_id,
            source_id=source_id,
            limit=limit,
        )
        items = search["items"]
        if not items:
            return {
                "mode": "offline_cache",
                "query": query,
                "answer": (
                    f"我没有在本地知识库里找到与“{query}”直接相关的片段。"
                    "可以换一个更具体的关键词，或者先导入相关资料后再试。"
                ),
                "citations": [],
            }

        top_items = items[: min(3, len(items))]
        lines = [f"我在本地知识库里找到 {len(top_items)} 条与“{query}”最相关的内容："]
        citations: list[dict] = []
        for index, item in enumerate(top_items, start=1):
            location = self._format_location(item.get("metadata"))
            source_title = item.get("source_title") or "未命名资料"
            excerpt = self._compress_text(item.get("excerpt") or item.get("content") or "")
            lines.append(f"{index}. {source_title}{location}：{excerpt}")
            citations.append(
                {
                    "source_id": item["source_id"],
                    "chunk_id": item["chunk_id"],
                    "source_title": source_title,
                    "excerpt": excerpt,
                    "metadata": item.get("metadata"),
                }
            )
        lines.append("以上内容基于本地离线检索结果整理，未调用云端模型。")

        return {
            "mode": "offline_cache",
            "query": query,
            "answer": "\n".join(lines),
            "citations": citations,
        }
