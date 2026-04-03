"""
Built-in Skill: create_scheduled_task
Allows the AI Agent to create automated recurring tasks from conversations.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.skills.base import SkillBase, SkillMeta

if TYPE_CHECKING:
    from app.agents.core.tools import ToolContext


class ScheduledTaskSkill(SkillBase):
    meta = SkillMeta(
        name="scheduled-task",
        display_name="定时任务",
        description=(
            "创建定时执行的自动化任务。"
            "当用户要求定期、每天、每周执行某项信息采集或报告生成任务时调用。"
            "例如：'每天监控AI资讯发到邮箱'、'每周总结知识库变化'。"
            "【重要】调用前必须确认用户已明确提供：任务名称、关注主题、执行频率、投递方式。"
            "如果用户只给了订阅链接或部分信息，必须先询问补全缺失项，不要自行编造。"
        ),
        category="productivity",
        interrupt_behavior="block",
        always=False,
        thought_label="⏰ 正在创建定时任务",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "create_scheduled_task",
            "description": (
                "创建定时执行的自动化任务。"
                "调用前必须向用户确认：任务名称(name)、关注主题(topic)、执行频率(schedule)、投递方式(delivery)。"
                "用户未明确提供的必填字段不得自行猜测，应先回复用户询问。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "任务名称，简洁描述任务内容，如'AI资讯日报'",
                    },
                    "topic": {
                        "type": "string",
                        "description": "监控/研究的主题，包含关键词，如'AI 人工智能 大模型 最新进展'",
                    },
                    "schedule": {
                        "type": "string",
                        "enum": ["daily", "weekly", "biweekly", "monthly", "every_3_days"],
                        "description": "执行频率",
                    },
                    "delivery": {
                        "type": "string",
                        "enum": ["email", "note", "both"],
                        "description": "结果投递方式：email=发送邮件，note=保存为笔记，both=两者都做",
                    },
                    "article_style": {
                        "type": "string",
                        "enum": ["summary", "detailed", "briefing"],
                        "description": "文章风格：summary=摘要速览，detailed=详细分析，briefing=简报",
                    },
                    "language": {
                        "type": "string",
                        "enum": ["zh", "en"],
                        "description": "输出语言",
                        "default": "zh",
                    },
                    "feed_urls": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "RSS/Atom 订阅源 URL 列表，任务将从这些源获取内容。与 topic 可同时使用。",
                    },
                },
                "required": ["name", "topic", "schedule", "delivery"],
            },
        }

    async def execute(self, args: dict, ctx: "ToolContext") -> str:
        from datetime import datetime, timezone

        from sqlalchemy import select
        from sqlalchemy import func as sqla_func

        from app.models import ScheduledTask, User, AppConfig
        from app.utils.cron import parse_schedule, schedule_label, next_run_from_cron

        name = args["name"]
        topic = args["topic"]
        schedule = args["schedule"]
        delivery = args.get("delivery", "email")
        article_style = args.get("article_style", "summary")
        language = args.get("language", "zh")

        cron_expr = parse_schedule(schedule)
        now = datetime.now(timezone.utc)
        next_run = next_run_from_cron(cron_expr, now)

        user_email = None
        if delivery in ("email", "both"):
            user_result = await ctx.db.execute(
                select(User.email).where(User.id == ctx.user_id)
            )
            user_email = user_result.scalar_one_or_none()
            if not user_email:
                cfg_result = await ctx.db.execute(
                    select(AppConfig.value).where(AppConfig.key == "notify_email")
                )
                user_email = cfg_result.scalar_one_or_none()

            if not user_email:
                return (
                    "无法创建邮件投递任务：未找到用户邮箱地址。"
                    "请先在设置中配置通知邮箱，或使用 note 投递方式。"
                )

        existing = await ctx.db.execute(
            select(sqla_func.count()).select_from(ScheduledTask).where(
                ScheduledTask.user_id == ctx.user_id,
                ScheduledTask.name == name,
                ScheduledTask.enabled == True,  # noqa: E712
            )
        )
        if existing.scalar() > 0:
            return f"已存在同名任务「{name}」，请更换名称或先禁用已有任务。"

        task_count = await ctx.db.execute(
            select(sqla_func.count()).select_from(ScheduledTask).where(
                ScheduledTask.user_id == ctx.user_id,
                ScheduledTask.enabled == True,  # noqa: E712
            )
        )
        if task_count.scalar() >= 10:
            return "你已有 10 个活跃定时任务，请先禁用或删除一些任务。"

        feed_urls = args.get("feed_urls") or []

        parameters = {
            "topic": topic,
            "keywords": topic.split(),
            "language": language,
            "max_sources": 10,
            "search_depth": "advanced",
            "article_style": article_style,
        }
        if feed_urls:
            parameters["feed_urls"] = [u.strip() for u in feed_urls if u.strip()]

        task = ScheduledTask(
            user_id=ctx.user_id,
            name=name,
            description=f"自动监控「{topic}」相关资讯，{schedule_label(schedule)}执行",
            task_type="news_digest",
            schedule_cron=cron_expr,
            parameters=parameters,
            delivery_config={
                "method": delivery,
                "email": user_email,
                "notebook_id": ctx.notebook_id,
            },
            next_run_at=next_run,
        )
        ctx.db.add(task)
        await ctx.db.flush()

        delivery_desc = {
            "email": f"发送到 {user_email}",
            "note": "保存为笔记",
            "both": f"发送到 {user_email} 并保存为笔记",
        }
        feed_line = ""
        if feed_urls:
            feed_line = f"**订阅源**：{len(feed_urls)} 个 RSS 源\n"

        return (
            f"✅ 定时任务已创建！\n\n"
            f"**任务名称**：{name}\n"
            f"**监控主题**：{topic}\n"
            f"{feed_line}"
            f"**执行频率**：{schedule_label(schedule)}\n"
            f"**投递方式**：{delivery_desc.get(delivery, delivery)}\n"
            f"**首次执行**：{next_run.strftime('%Y-%m-%d %H:%M')} (UTC)\n\n"
            f"你可以在设置中管理定时任务（启用/禁用/编辑/删除）。"
        )


skill = ScheduledTaskSkill()
