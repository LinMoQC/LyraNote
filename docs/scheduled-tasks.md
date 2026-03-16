# 定时任务系统设计文档

> 设计日期：2026-03-13  
> 依赖特性：Skills 系统、Celery + Redis、Tavily Web Search、SMTP 邮件  
> 目标：让 AI Agent 能够创建和管理定时任务，实现"监控资讯 → 生成文章 → 定时推送"等自动化工作流

---

## 一、背景与动机

### 1.1 用户场景

用户在与 AI 对话时，经常会表达**周期性、持续性的信息需求**：

| 用户请求示例 | 期望行为 |
|---|---|
| "帮我监控最新的 AI 资讯，每天整理成文章发到我邮箱" | 每日：Tavily 搜索 → LLM 生成摘要文章 → 邮件推送 |
| "每周一帮我总结知识库的变化" | 每周：检查新增来源 → LLM 生成变化摘要 → 保存为笔记 |
| "每天早上给我一份研究领域的论文速递" | 每日：搜索 arXiv/学术来源 → LLM 提炼要点 → 邮件推送 |
| "每隔三天检查一下竞品动态，写个简报" | 每 3 天：搜索竞品关键词 → LLM 生成竞品简报 → 笔记 + 邮件 |

当前 LyraNote 的 Agent 只支持一次性交互（Ask 或 Deep Research），无法处理这类**"设定一次，持续执行"**的任务。

### 1.2 与现有功能的关系

| 模块 | 角色 |
|---|---|
| **Skills 系统** | 新增 `create_scheduled_task` 技能，Agent 通过 function calling 创建任务 |
| **Celery + Redis** | 已有基础设施，扩展 Beat 调度 + 新增执行任务 |
| **Tavily Web Search** | 复用现有 `providers/tavily.py`，作为定时任务的数据采集源 |
| **SMTP 配置** | 已有 `app_config` 中的 SMTP 字段（`smtp_host` 等），但缺少发送实现 |
| **Deep Research** | 定时任务的"研究更新"类型可复用深度研究的搜索与综合逻辑 |

### 1.3 核心价值

1. **从被动到主动**：AI 不再只是"被问才答"，而是主动为用户工作
2. **知识自动化管道**：信息采集 → 内容生成 → 知识投递形成闭环
3. **毕设差异化亮点**：目前主流知识管理工具（Notion AI、Obsidian Copilot）均不支持 Agent 创建定时任务

---

## 二、整体架构

### 2.1 系统架构图

```
用户："帮我每天监控AI资讯，发到邮箱"
     │
     ▼
┌──────────────────────────────────────────────────────┐
│  ReAct Agent                                         │
│  ├─ 意图识别：用户想创建定时任务                         │
│  └─ 调用 create_scheduled_task 工具                    │
│     参数: {                                           │
│       name: "AI资讯日报",                              │
│       topic: "AI 人工智能 大模型 最新进展",              │
│       schedule: "daily",                              │
│       delivery: "email"                               │
│     }                                                │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  create_scheduled_task Skill (execute)                │
│  ├─ 解析 schedule → cron 表达式 "0 8 * * *"           │
│  ├─ 读取用户邮箱配置                                    │
│  ├─ 创建 ScheduledTask 记录 (DB)                       │
│  ├─ 计算 next_run_at                                  │
│  └─ 返回确认消息给 LLM                                 │
└──────────────┬───────────────────────────────────────┘
               │
               ▼ (存入 PostgreSQL)
┌──────────────────────────────────────────────────────┐
│  scheduled_tasks 表                                   │
│  ├─ id, user_id, name, task_type                     │
│  ├─ schedule_cron: "0 8 * * *"                       │
│  ├─ parameters: {topic, keywords, language, ...}     │
│  ├─ delivery_config: {method, email, notebook_id}    │
│  ├─ enabled: true                                    │
│  └─ next_run_at: 2026-03-14T08:00:00Z               │
└──────────────────────────────────────────────────────┘
               │
               │ Celery Beat 每分钟检查
               ▼
┌──────────────────────────────────────────────────────┐
│  check_scheduled_tasks (Celery Beat 定时任务)          │
│  ├─ SELECT * FROM scheduled_tasks                    │
│  │   WHERE enabled = true AND next_run_at <= now()   │
│  └─ 对每个到期任务: execute_scheduled_task.delay(id)   │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  execute_scheduled_task (Celery Worker)               │
│                                                      │
│  ┌─ Phase 1: 数据采集 ─────────────────────────┐     │
│  │  Tavily 搜索 topic 相关最新内容              │     │
│  │  max_results=10, search_depth="advanced"    │     │
│  └─────────────────────────────────────────────┘     │
│                    │                                  │
│  ┌─ Phase 2: 内容生成 ─────────────────────────┐     │
│  │  LLM 将搜索结果整合为结构化 Markdown 文章     │     │
│  │  - 标题、摘要、正文、来源列表                 │     │
│  │  - 按相关性和时效性排序                       │     │
│  └─────────────────────────────────────────────┘     │
│                    │                                  │
│  ┌─ Phase 3: 内容投递 ─────────────────────────┐     │
│  │  email → Markdown 转 HTML → SMTP 发送        │     │
│  │  note  → 创建笔记到用户全局笔记本             │     │
│  └─────────────────────────────────────────────┘     │
│                    │                                  │
│  ┌─ Phase 4: 状态更新 ─────────────────────────┐     │
│  │  run_count += 1                              │     │
│  │  last_run_at = now()                         │     │
│  │  next_run_at = croniter.get_next()           │     │
│  │  last_result = "成功，已发送至 xxx@yyy.com"    │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

### 2.2 数据流概览

```
创建流程:  用户对话 → Agent → Skill → DB
调度流程:  Celery Beat → check_scheduled_tasks → execute_scheduled_task
执行流程:  Tavily 搜索 → LLM 生成 → 邮件/笔记投递 → 状态更新
管理流程:  前端 UI → REST API → DB (启用/禁用/编辑/删除)
```

---

## 三、数据模型

### 3.1 `scheduled_tasks` 表

```python
class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # ── 基本信息 ──
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="news_digest"
    )
    # task_type 枚举:
    #   "news_digest"      — 资讯摘要（搜索 + 生成文章）
    #   "research_update"  — 研究更新（基于深度研究的定期追踪）
    #   "knowledge_summary"— 知识库变化摘要
    #   "custom_prompt"    — 自定义 prompt 执行

    # ── 调度配置 ──
    schedule_cron: Mapped[str] = mapped_column(String(100), nullable=False)
    # 标准 cron 表达式: "0 8 * * *"（每天8点）, "0 9 * * 1"（每周一9点）
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Shanghai")

    # ── 任务参数 ──
    parameters: Mapped[dict] = mapped_column(JSONB, default=dict)
    # news_digest 示例:
    # {
    #   "topic": "AI 人工智能 大模型",
    #   "keywords": ["LLM", "AGI", "transformer"],
    #   "language": "zh",
    #   "max_sources": 10,
    #   "search_depth": "advanced",
    #   "article_style": "summary",      # "summary" | "detailed" | "briefing"
    #   "custom_prompt": ""               # 用户自定义的生成指令
    # }

    # ── 投递配置 ──
    delivery_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    # {
    #   "method": "email",              # "email" | "note" | "both"
    #   "email": "user@example.com",    # 投递邮箱（为空则用用户注册邮箱）
    #   "notebook_id": null             # 笔记投递目标（为空则用全局笔记本）
    # }

    # ── 运行状态 ──
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    last_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)

    # ── 时间戳 ──
    created_at: Mapped[datetime] = now_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # ── 关系 ──
    user: Mapped["User"] = relationship(back_populates="scheduled_tasks")
```

**索引设计**：
- `idx_scheduled_tasks_next_run`: `(enabled, next_run_at)` — 调度器查询热路径
- `idx_scheduled_tasks_user`: `(user_id)` — 用户任务列表查询

### 3.2 `scheduled_task_runs` 表（执行历史）

```python
class ScheduledTaskRun(Base):
    __tablename__ = "scheduled_task_runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scheduled_tasks.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    # "running" | "success" | "failed" | "skipped"
    started_at: Mapped[datetime] = now_col()
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 生成的 Markdown 文章内容（用于前端查看历史产出）
    sources_count: Mapped[int] = mapped_column(Integer, default=0)
    delivery_status: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # {"email": "sent", "note": "created", "note_id": "uuid-..."}
```

### 3.3 User 模型扩展

在 `User` 模型中添加关系：

```python
# User 类中新增
scheduled_tasks: Mapped[list["ScheduledTask"]] = relationship(
    back_populates="user", passive_deletes=True
)
```

### 3.4 Alembic 迁移

新建 `api/alembic/versions/xxx_scheduled_tasks.py`，创建 `scheduled_tasks` 和 `scheduled_task_runs` 两张表。

---

## 四、Agent Skill 设计

### 4.1 `create_scheduled_task` 技能

**文件**: `api/app/skills/builtin/scheduled_task.py`

```python
class ScheduledTaskSkill(SkillBase):
    meta = SkillMeta(
        name="scheduled-task",
        display_name="定时任务",
        description=(
            "创建定时执行的自动化任务。"
            "当用户要求定期、每天、每周执行某项信息采集或报告生成任务时调用。"
            "例如：'每天监控AI资讯发到邮箱'、'每周总结知识库变化'。"
        ),
        category="productivity",
        always=False,
        thought_label="⏰ 正在创建定时任务",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "create_scheduled_task",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "任务名称，简洁描述任务内容，如'AI资讯日报'"
                    },
                    "topic": {
                        "type": "string",
                        "description": "监控/研究的主题，包含关键词，如'AI 人工智能 大模型 最新进展'"
                    },
                    "schedule": {
                        "type": "string",
                        "enum": ["daily", "weekly", "biweekly", "monthly", "every_3_days"],
                        "description": "执行频率"
                    },
                    "delivery": {
                        "type": "string",
                        "enum": ["email", "note", "both"],
                        "description": "结果投递方式：email=发送邮件，note=保存为笔记，both=两者都做"
                    },
                    "article_style": {
                        "type": "string",
                        "enum": ["summary", "detailed", "briefing"],
                        "description": "文章风格：summary=摘要速览，detailed=详细分析，briefing=简报"
                    },
                    "language": {
                        "type": "string",
                        "enum": ["zh", "en"],
                        "description": "输出语言",
                        "default": "zh"
                    },
                },
                "required": ["name", "topic", "schedule", "delivery"]
            }
        }

    async def execute(self, args: dict, ctx: "ToolContext") -> str:
        from app.utils.cron import parse_schedule, next_run_from_cron
        from app.models import ScheduledTask, User
        # ... 实现逻辑见 4.3 节
```

### 4.2 Schedule 到 Cron 的映射

| schedule 参数 | cron 表达式 | 含义 |
|---|---|---|
| `daily` | `0 8 * * *` | 每天早上 8:00 |
| `weekly` | `0 9 * * 1` | 每周一早上 9:00 |
| `biweekly` | `0 9 1,15 * *` | 每月 1 号和 15 号 |
| `monthly` | `0 9 1 * *` | 每月 1 号 |
| `every_3_days` | `0 8 */3 * *` | 每 3 天 |

### 4.3 Skill Execute 逻辑

```python
async def execute(self, args: dict, ctx: "ToolContext") -> str:
    from datetime import datetime, timezone
    from uuid import UUID
    from sqlalchemy import select, func as sqla_func

    from app.models import ScheduledTask, User
    from app.utils.cron import parse_schedule, next_run_from_cron

    name = args["name"]
    topic = args["topic"]
    schedule = args["schedule"]
    delivery = args.get("delivery", "email")
    article_style = args.get("article_style", "summary")
    language = args.get("language", "zh")

    # 1. 解析 cron
    cron_expr = parse_schedule(schedule)
    now = datetime.now(timezone.utc)
    next_run = next_run_from_cron(cron_expr, now)

    # 2. 获取用户邮箱
    user_email = None
    if delivery in ("email", "both"):
        user_result = await ctx.db.execute(
            select(User.email).where(User.id == UUID(ctx.user_id))
        )
        user_email = user_result.scalar_one_or_none()
        if not user_email:
            # 尝试从 app_config 获取通知邮箱
            from app.models import AppConfig
            cfg_result = await ctx.db.execute(
                select(AppConfig.value).where(AppConfig.key == "notify_email")
            )
            user_email = cfg_result.scalar_one_or_none()

        if not user_email:
            return (
                "无法创建邮件投递任务：未找到用户邮箱地址。"
                "请先在设置 → 通知中配置通知邮箱，或使用 note 投递方式。"
            )

    # 3. 检查同名任务
    existing = await ctx.db.execute(
        select(sqla_func.count()).select_from(ScheduledTask).where(
            ScheduledTask.user_id == UUID(ctx.user_id),
            ScheduledTask.name == name,
            ScheduledTask.enabled == True,
        )
    )
    if existing.scalar() > 0:
        return f"已存在同名任务「{name}」，请更换名称或先禁用已有任务。"

    # 4. 创建任务
    task = ScheduledTask(
        user_id=UUID(ctx.user_id),
        name=name,
        description=f"自动监控「{topic}」相关资讯，{schedule_label(schedule)}执行",
        task_type="news_digest",
        schedule_cron=cron_expr,
        parameters={
            "topic": topic,
            "keywords": topic.split(),
            "language": language,
            "max_sources": 10,
            "search_depth": "advanced",
            "article_style": article_style,
        },
        delivery_config={
            "method": delivery,
            "email": user_email,
            "notebook_id": ctx.notebook_id,
        },
        next_run_at=next_run,
    )
    ctx.db.add(task)
    await ctx.db.flush()

    # 5. 返回确认
    delivery_desc = {
        "email": f"发送到 {user_email}",
        "note": "保存为笔记",
        "both": f"发送到 {user_email} 并保存为笔记",
    }
    return (
        f"✅ 定时任务已创建！\n\n"
        f"**任务名称**：{name}\n"
        f"**监控主题**：{topic}\n"
        f"**执行频率**：{schedule_label(schedule)}\n"
        f"**投递方式**：{delivery_desc.get(delivery, delivery)}\n"
        f"**首次执行**：{next_run.strftime('%Y-%m-%d %H:%M')} (UTC)\n\n"
        f"你可以在设置中管理定时任务（启用/禁用/编辑/删除）。"
    )
```

---

## 五、Cron 工具模块

### 5.1 `api/app/utils/cron.py`

**依赖**：`croniter`（pip 包，用于 cron 表达式解析）

```python
"""
Cron expression utilities for scheduled tasks.
"""

from datetime import datetime, timezone
from croniter import croniter

SCHEDULE_MAP = {
    "daily":        "0 8 * * *",
    "weekly":       "0 9 * * 1",
    "biweekly":     "0 9 1,15 * *",
    "monthly":      "0 9 1 * *",
    "every_3_days": "0 8 */3 * *",
}

SCHEDULE_LABELS = {
    "daily":        "每天",
    "weekly":       "每周一",
    "biweekly":     "每两周",
    "monthly":      "每月",
    "every_3_days": "每3天",
}


def parse_schedule(schedule: str) -> str:
    """将预设调度名称转为 cron 表达式。也接受原始 cron 表达式。"""
    if schedule in SCHEDULE_MAP:
        return SCHEDULE_MAP[schedule]
    # 验证是否为合法 cron 表达式
    try:
        croniter(schedule)
        return schedule
    except (ValueError, KeyError):
        raise ValueError(f"Invalid schedule: {schedule}")


def schedule_label(schedule: str) -> str:
    """返回调度频率的中文描述。"""
    return SCHEDULE_LABELS.get(schedule, schedule)


def next_run_from_cron(cron_expr: str, from_time: datetime | None = None) -> datetime:
    """根据 cron 表达式计算下次执行时间。"""
    base = from_time or datetime.now(timezone.utc)
    cron = croniter(cron_expr, base)
    return cron.get_next(datetime).replace(tzinfo=timezone.utc)
```

---

## 六、邮件发送模块

### 6.1 `api/app/providers/email.py`

**依赖**：`aiosmtplib`（异步 SMTP 库）

```python
"""
Email sending provider using SMTP configuration from app_config.
"""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppConfig

logger = logging.getLogger(__name__)


async def _get_smtp_config(db: AsyncSession) -> dict:
    """从 app_config 表读取 SMTP 配置。"""
    keys = ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from"]
    result = await db.execute(
        select(AppConfig.key, AppConfig.value).where(AppConfig.key.in_(keys))
    )
    config = {row[0]: row[1] for row in result.all()}
    return config


async def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str = "",
    db: AsyncSession | None = None,
    smtp_config: dict | None = None,
) -> bool:
    """
    发送邮件。

    Args:
        to: 收件人邮箱
        subject: 邮件主题
        html_body: HTML 格式正文
        text_body: 纯文本正文（回退）
        db: 数据库会话（用于读取 SMTP 配置）
        smtp_config: 直接传入 SMTP 配置（优先级高于 DB）

    Returns:
        True if sent successfully, False otherwise
    """
    config = smtp_config or (await _get_smtp_config(db) if db else {})

    host = config.get("smtp_host", "")
    port = int(config.get("smtp_port", 587))
    username = config.get("smtp_username", "")
    password = config.get("smtp_password", "")
    from_addr = config.get("smtp_from", username)

    if not host or not username:
        logger.error("SMTP not configured: missing host or username")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=username,
            password=password,
            start_tls=True,
        )
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False
```

### 6.2 Markdown → HTML 转换

用于将 LLM 生成的 Markdown 文章转为邮件 HTML：

```python
# api/app/utils/markdown_email.py

import markdown


def markdown_to_email_html(md_content: str, title: str = "") -> str:
    """将 Markdown 转为带基础样式的邮件 HTML。"""
    body_html = markdown.markdown(
        md_content,
        extensions=["extra", "codehilite", "tables", "toc"]
    )
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, sans-serif; max-width: 680px;
                 margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <div style="border-bottom: 2px solid #6366f1; padding-bottom: 16px;
                  margin-bottom: 24px;">
        <h1 style="font-size: 22px; margin: 0;">{title}</h1>
        <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">
          由 LyraNote 自动生成
        </p>
      </div>
      <div style="line-height: 1.7; font-size: 15px;">
        {body_html}
      </div>
      <div style="border-top: 1px solid #e5e7eb; margin-top: 32px;
                  padding-top: 16px; color: #9ca3af; font-size: 12px;">
        此邮件由 LyraNote 定时任务自动发送。
        如需停止接收，请在 LyraNote 设置中管理定时任务。
      </div>
    </body>
    </html>
    """
```

---

## 七、任务执行器

### 7.1 Celery Beat 调度器扩展

在 `api/app/workers/tasks.py` 中新增 Beat 定时检查：

```python
celery_app.conf.update(
    beat_schedule={
        "decay-stale-memories-daily": {
            "task": "decay_all_user_memories",
            "schedule": 86400.0,
        },
        # 新增：每分钟检查到期的定时任务
        "check-scheduled-tasks": {
            "task": "check_scheduled_tasks",
            "schedule": 60.0,   # 每 60 秒检查一次
        },
    },
)
```

### 7.2 `check_scheduled_tasks` — 调度分发

```python
@celery_app.task(name="check_scheduled_tasks")
def check_scheduled_tasks():
    """
    Celery Beat 每分钟执行：查找所有到期且启用的定时任务，逐个分发执行。
    设计要点：
    - 使用 SELECT ... FOR UPDATE SKIP LOCKED 防止多 Worker 重复执行
    - 先更新 next_run_at 再分发，避免下次 Beat 再次触发同一任务
    - 连续失败超过 5 次的任务自动禁用
    """
    async def _run():
        from datetime import datetime, timezone
        from sqlalchemy import select, update
        from app.models import ScheduledTask
        from app.utils.cron import next_run_from_cron

        now = datetime.now(timezone.utc)

        async with _task_db() as db:
            # 查找到期任务
            result = await db.execute(
                select(ScheduledTask).where(
                    ScheduledTask.enabled == True,
                    ScheduledTask.next_run_at <= now,
                    ScheduledTask.consecutive_failures < 5,
                )
            )
            due_tasks = result.scalars().all()

            for task in due_tasks:
                # 先计算并更新 next_run_at，防止重复触发
                next_run = next_run_from_cron(task.schedule_cron, now)
                task.next_run_at = next_run
                await db.flush()

                # 分发执行
                execute_scheduled_task.delay(str(task.id))

            await db.commit()

    _run_async(_run())
```

### 7.3 `execute_scheduled_task` — 单任务执行器

```python
@celery_app.task(name="execute_scheduled_task", bind=True, max_retries=2)
def execute_scheduled_task(self, task_id: str):
    """
    执行单个定时任务的完整流程：
    1. 数据采集（Tavily 搜索）
    2. 内容生成（LLM 生成文章）
    3. 内容投递（邮件/笔记）
    4. 状态更新（运行记录）
    """
    async def _run():
        import time
        from datetime import datetime, timezone
        from uuid import UUID

        from openai import AsyncOpenAI
        from sqlalchemy import select

        from app.config import settings
        from app.models import ScheduledTask, ScheduledTaskRun
        from app.providers import tavily
        from app.providers.email import send_email
        from app.utils.markdown_email import markdown_to_email_html

        start_time = time.monotonic()

        async with _task_db() as db:
            # 加载任务
            result = await db.execute(
                select(ScheduledTask).where(ScheduledTask.id == UUID(task_id))
            )
            task = result.scalar_one_or_none()
            if not task or not task.enabled:
                return

            # 创建执行记录
            run = ScheduledTaskRun(
                task_id=task.id,
                status="running",
            )
            db.add(run)
            await db.flush()

            try:
                params = task.parameters or {}
                topic = params.get("topic", "")
                language = params.get("language", "zh")
                article_style = params.get("article_style", "summary")
                max_sources = params.get("max_sources", 10)

                # ── Phase 1: 数据采集 ──
                search_results = await tavily.search(
                    topic,
                    max_results=max_sources,
                    search_depth=params.get("search_depth", "advanced"),
                )

                if not search_results:
                    raise RuntimeError(f"No search results for topic: {topic}")

                # ── Phase 2: 内容生成 ──
                sources_text = "\n\n".join(
                    f"[来源{i+1}] {r.get('title', '未知')}\n"
                    f"URL: {r.get('url', '')}\n"
                    f"{r.get('content', '')[:800]}"
                    for i, r in enumerate(search_results)
                )

                style_instructions = {
                    "summary": "简洁的摘要速览，每条资讯 2-3 句话概括",
                    "detailed": "详细的分析文章，深入解读每个要点",
                    "briefing": "简报格式，要点列表，适合快速浏览",
                }

                client = AsyncOpenAI(
                    api_key=settings.openai_api_key,
                    base_url=settings.openai_base_url or None,
                )

                prompt = (
                    f"你是一位专业的资讯编辑。请根据以下搜索结果，"
                    f"撰写一篇关于「{topic}」的{'中文' if language == 'zh' else 'English'}资讯文章。\n\n"
                    f"**风格要求**：{style_instructions.get(article_style, style_instructions['summary'])}\n\n"
                    f"**格式要求**：\n"
                    f"1. 使用 Markdown 格式\n"
                    f"2. 开头写一段 2-3 句话的总结摘要\n"
                    f"3. 按主题分组，每组有清晰的小标题\n"
                    f"4. 在文末列出所有来源链接\n"
                    f"5. 注明文章生成日期\n\n"
                    f"**搜索结果**：\n{sources_text}"
                )

                resp = await client.chat.completions.create(
                    model=settings.llm_model or "gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.5,
                    max_tokens=2000,
                )
                article_md = resp.choices[0].message.content or ""

                if not article_md:
                    raise RuntimeError("LLM returned empty content")

                # ── Phase 3: 内容投递 ──
                delivery = task.delivery_config or {}
                method = delivery.get("method", "email")
                delivery_status = {}
                article_title = f"{task.name} — {datetime.now().strftime('%Y-%m-%d')}"

                # 邮件投递
                if method in ("email", "both"):
                    email_to = delivery.get("email", "")
                    if email_to:
                        html = markdown_to_email_html(article_md, article_title)
                        sent = await send_email(
                            to=email_to,
                            subject=article_title,
                            html_body=html,
                            text_body=article_md,
                            db=db,
                        )
                        delivery_status["email"] = "sent" if sent else "failed"
                    else:
                        delivery_status["email"] = "skipped_no_address"

                # 笔记投递
                if method in ("note", "both"):
                    from app.skills.builtin.create_note import _markdown_to_tiptap
                    from app.models import Note, Notebook

                    notebook_id = delivery.get("notebook_id")
                    if not notebook_id:
                        # 使用用户全局笔记本
                        nb_result = await db.execute(
                            select(Notebook.id).where(
                                Notebook.user_id == task.user_id,
                                Notebook.is_system == True,
                                Notebook.system_type == "global",
                            )
                        )
                        notebook_id = nb_result.scalar_one_or_none()

                    if notebook_id:
                        note = Note(
                            notebook_id=notebook_id if isinstance(notebook_id, UUID)
                                        else UUID(notebook_id),
                            user_id=task.user_id,
                            title=article_title,
                            content_json=_markdown_to_tiptap(article_md),
                            content_text=article_md,
                        )
                        db.add(note)
                        await db.flush()
                        delivery_status["note"] = "created"
                        delivery_status["note_id"] = str(note.id)
                    else:
                        delivery_status["note"] = "skipped_no_notebook"

                # ── Phase 4: 状态更新 ──
                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                run.status = "success"
                run.finished_at = datetime.now(timezone.utc)
                run.duration_ms = elapsed_ms
                run.result_summary = f"生成 {len(article_md)} 字文章，{len(search_results)} 个来源"
                run.generated_content = article_md
                run.sources_count = len(search_results)
                run.delivery_status = delivery_status

                task.run_count += 1
                task.last_run_at = datetime.now(timezone.utc)
                task.last_result = run.result_summary
                task.last_error = None
                task.consecutive_failures = 0

                await db.commit()

            except Exception as exc:
                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                run.status = "failed"
                run.finished_at = datetime.now(timezone.utc)
                run.duration_ms = elapsed_ms
                run.error_message = str(exc)

                task.last_error = str(exc)
                task.consecutive_failures += 1

                # 连续失败 5 次自动禁用
                if task.consecutive_failures >= 5:
                    task.enabled = False
                    task.last_error += " [已自动禁用：连续失败超过5次]"

                await db.commit()
                raise self.retry(exc=exc, countdown=300)

    _run_async(_run())
```

---

## 八、REST API 设计

### 8.1 端点列表

**路由前缀**: `/api/v1/tasks`  
**文件**: `api/app/domains/task/router.py`

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| `GET` | `/tasks` | 获取当前用户的定时任务列表 | 需登录 |
| `GET` | `/tasks/{id}` | 获取单个任务详情 | 需登录 + 所有者 |
| `PATCH` | `/tasks/{id}` | 更新任务（schedule、enabled、parameters 等） | 需登录 + 所有者 |
| `DELETE` | `/tasks/{id}` | 删除任务 | 需登录 + 所有者 |
| `POST` | `/tasks/{id}/run` | 手动立即执行一次 | 需登录 + 所有者 |
| `GET` | `/tasks/{id}/runs` | 获取任务执行历史 | 需登录 + 所有者 |

### 8.2 请求/响应示例

#### GET /tasks

```json
// Response 200
[
  {
    "id": "uuid-...",
    "name": "AI资讯日报",
    "description": "自动监控「AI 人工智能 大模型」相关资讯，每天执行",
    "task_type": "news_digest",
    "schedule_cron": "0 8 * * *",
    "schedule_label": "每天 08:00",
    "enabled": true,
    "parameters": {
      "topic": "AI 人工智能 大模型",
      "article_style": "summary"
    },
    "delivery_config": {
      "method": "email",
      "email": "user@example.com"
    },
    "last_run_at": "2026-03-12T08:00:12Z",
    "next_run_at": "2026-03-13T08:00:00Z",
    "run_count": 5,
    "last_result": "生成 1823 字文章，8 个来源",
    "last_error": null,
    "created_at": "2026-03-07T14:30:00Z"
  }
]
```

#### PATCH /tasks/{id}

```json
// Request Body
{
  "enabled": false
}

// 或修改调度
{
  "schedule_cron": "0 9 * * *",
  "parameters": {
    "topic": "AI 人工智能 AGI",
    "article_style": "detailed"
  }
}
```

#### POST /tasks/{id}/run

```json
// Response 200
{
  "run_id": "uuid-...",
  "status": "dispatched",
  "message": "任务已加入执行队列"
}
```

#### GET /tasks/{id}/runs

```json
// Response 200
[
  {
    "id": "uuid-...",
    "status": "success",
    "started_at": "2026-03-12T08:00:05Z",
    "finished_at": "2026-03-12T08:00:42Z",
    "duration_ms": 37200,
    "result_summary": "生成 1823 字文章，8 个来源",
    "sources_count": 8,
    "delivery_status": {"email": "sent"},
    "generated_content": "# AI资讯日报 — 2026-03-12\n\n..."
  }
]
```

---

## 九、前端设计

### 9.1 页面入口

在侧边栏 nav 中新增"定时任务"入口（可放在"设置"旁边或作为独立页面）。

路由：`/app/tasks`

### 9.2 任务列表页

```
┌─────────────────────────────────────────────────────────┐
│  ⏰ 定时任务                                   [+ 新建]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  📰 AI资讯日报                          [开关🟢] │   │
│  │  每天 08:00 · 邮件投递                           │   │
│  │  上次执行：2026-03-12 08:00 · 生成 1823 字       │   │
│  │  下次执行：2026-03-13 08:00                      │   │
│  │                   [立即执行] [编辑] [查看历史]     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  📊 竞品动态简报                        [开关🟢] │   │
│  │  每3天 08:00 · 笔记 + 邮件                      │   │
│  │  上次执行：2026-03-10 08:00 · 生成 2105 字       │   │
│  │  下次执行：2026-03-13 08:00                      │   │
│  │                   [立即执行] [编辑] [查看历史]     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 9.3 执行历史弹窗

点击"查看历史"后展开或弹窗显示：

```
┌─────────────────────────────────────────────────────┐
│  AI资讯日报 · 执行历史                        [关闭] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ✅ 2026-03-12 08:00  37.2s  8个来源  1823字        │
│     [查看生成内容]                                   │
│                                                     │
│  ✅ 2026-03-11 08:00  42.1s  10个来源 2156字        │
│     [查看生成内容]                                   │
│                                                     │
│  ❌ 2026-03-10 08:00  5.3s   失败                   │
│     错误：Tavily API rate limit exceeded            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 十、安全与容错设计

### 10.1 防滥用

| 风险 | 防护措施 |
|---|---|
| 用户创建大量任务导致系统负载过高 | 每用户最多 10 个活跃任务 |
| 任务执行消耗大量 Tavily API 配额 | 单次任务最多搜索 10 条；每日全局执行上限 |
| LLM 调用成本 | 使用 `gpt-4o-mini` 生成，控制 max_tokens |
| SMTP 配置泄露 | SMTP 密码在 DB 中加密存储，API 不返回密码明文 |

### 10.2 容错机制

| 场景 | 处理策略 |
|---|---|
| Tavily 搜索失败 | Celery 重试（最多 2 次，间隔 5 分钟） |
| LLM 生成失败 | 重试；若持续失败，记录错误，跳过本次 |
| 邮件发送失败 | 记录 `delivery_status.email = "failed"`，不影响笔记投递 |
| 连续失败 5 次 | 自动禁用任务，`last_error` 标注原因 |
| 任务执行超时 | Celery `soft_time_limit=300`（5 分钟） |
| Beat 重复触发 | 先更新 `next_run_at` 再分发，确保不重复 |

### 10.3 可观测性

- 每次执行记录到 `scheduled_task_runs` 表（含耗时、来源数、生成字数、投递状态）
- `consecutive_failures` 字段追踪连续失败次数
- 前端展示执行历史和错误信息

---

## 十一、新增依赖

| 依赖包 | 用途 | 版本建议 |
|---|---|---|
| `croniter` | Cron 表达式解析与下次执行时间计算 | `>=2.0` |
| `aiosmtplib` | 异步 SMTP 邮件发送 | `>=3.0` |
| `markdown` | Markdown → HTML 转换（邮件正文） | `>=3.5` |

添加到 `api/requirements.txt`。

---

## 十二、文件改动清单

### 新建文件

| 文件路径 | 说明 |
|---|---|
| `api/app/utils/cron.py` | Cron 表达式工具模块 |
| `api/app/utils/markdown_email.py` | Markdown → 邮件 HTML 转换 |
| `api/app/providers/email.py` | SMTP 邮件发送模块 |
| `api/app/skills/builtin/scheduled_task.py` | `create_scheduled_task` Agent 技能 |
| `api/app/domains/task/router.py` | 定时任务管理 REST API |
| `api/alembic/versions/xxx_scheduled_tasks.py` | 数据库迁移脚本 |
| `web/src/features/tasks/tasks-view.tsx` | 前端任务管理页面 |
| `web/src/features/tasks/task-card.tsx` | 任务卡片组件 |
| `web/src/features/tasks/task-history-dialog.tsx` | 执行历史弹窗 |
| `web/src/services/task-service.ts` | 前端 API 调用 |

### 修改文件

| 文件路径 | 改动 |
|---|---|
| `api/app/models.py` | 新增 `ScheduledTask` + `ScheduledTaskRun` 模型 |
| `api/app/workers/tasks.py` | 新增 `check_scheduled_tasks` + `execute_scheduled_task` Celery 任务；Beat schedule 新增条目 |
| `api/app/main.py` | 注册 task router |
| `api/requirements.txt` | 添加 `croniter`、`aiosmtplib`、`markdown` |
| `web/src/app/(workspace)/app/` | 新增 tasks 路由页面 |
| `web/src/components/nav/` | 侧边栏新增"定时任务"入口 |
| `web/messages/zh.json` / `en.json` | 新增定时任务相关 i18n |

---

## 十三、实现路线图

### Phase 1：核心管道（后端，2-3 天）

- [ ] 数据库模型 + Alembic 迁移
- [ ] `api/app/utils/cron.py` Cron 工具
- [ ] `api/app/providers/email.py` 邮件发送模块
- [ ] `api/app/utils/markdown_email.py` Markdown → HTML
- [ ] `check_scheduled_tasks` + `execute_scheduled_task` Celery 任务
- [ ] Beat schedule 配置

### Phase 2：Agent 集成（1-2 天）

- [ ] `create_scheduled_task` Agent Skill
- [ ] Skills Registry 注册
- [ ] 端到端测试：对话 → 创建任务 → 执行 → 邮件发送

### Phase 3：管理 API（1 天）

- [ ] REST API 端点（CRUD + 手动执行 + 历史查询）
- [ ] 注册到 FastAPI main router

### Phase 4：前端 UI（2-3 天）

- [ ] 任务列表页
- [ ] 任务卡片组件（含开关、编辑、删除）
- [ ] 执行历史弹窗
- [ ] 侧边栏导航入口
- [ ] i18n 翻译

### Phase 5：扩展任务类型（后续迭代）

- [ ] `research_update`：基于深度研究的定期追踪
- [ ] `knowledge_summary`：知识库变化摘要
- [ ] `custom_prompt`：用户自定义 prompt 定时执行
- [ ] 前端任务创建表单（不依赖 Agent 对话）
- [ ] 任务模板市场

---

## 十四、毕设论文价值点

1. **Agent 主动性扩展**：从"被动问答"到"主动执行"，展示 LLM Agent 能力边界的拓展
2. **事件驱动架构**：Celery Beat + 异步任务 + SSE 的完整事件驱动链路设计
3. **信息自动化管道**：采集 → 生成 → 投递的端到端自动化工作流设计
4. **容错与可观测性**：重试策略、自动熔断、执行历史记录的工程实践
5. **对比分析**：与 Manus（任务执行平台）、AutoGPT（自主 Agent）的架构对比
