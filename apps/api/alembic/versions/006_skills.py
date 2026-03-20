"""Add Skills plugin system tables: skill_installs + user_skill_configs

Revision ID: 006
Revises: 005
Create Date: 2026-03-10
"""

import json
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # skill_installs — global registry of all known skills
    op.create_table(
        "skill_installs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("is_builtin", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("always", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("requires_env", JSONB, nullable=True),
        sa.Column("config_schema", JSONB, nullable=True),
        sa.Column("config", JSONB, nullable=True),
        sa.Column(
            "installed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_skill_installs_name", "skill_installs", ["name"], unique=True)

    # user_skill_configs — per-user overrides
    op.create_table(
        "user_skill_configs",
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            primary_key=True,
        ),
        sa.Column("skill_name", sa.String(100), nullable=False, primary_key=True),
        sa.Column("is_enabled", sa.Boolean, nullable=True),
        sa.Column("config", JSONB, nullable=True),
    )
    op.create_index(
        "ix_user_skill_configs_user_skill",
        "user_skill_configs",
        ["user_id", "skill_name"],
        unique=True,
    )

    _seed_builtin_skills()


def _seed_builtin_skills() -> None:
    now = datetime.now(timezone.utc)

    # Use raw INSERT via executemany-style with named params.
    # asyncpg does not allow mixing `::` cast syntax with named params,
    # so JSONB columns are passed as pre-serialized JSON strings and the
    # column definition (JSONB) handles the implicit cast.
    conn = op.get_bind()

    skills = [
        {
            "id": str(uuid.uuid4()),
            "name": "search-notebook-knowledge",
            "display_name": "知识库检索",
            "description": "在知识库中检索与问题最相关的内容片段",
            "category": "knowledge",
            "version": "1.0.0",
            "is_builtin": True,
            "is_enabled": True,
            "always": True,
            "requires_env": None,
            "config_schema": json.dumps({"type": "object", "properties": {"top_k": {"type": "integer", "default": 5}, "min_score": {"type": "number", "default": 0.3}}}),
            "config": json.dumps({"top_k": 5, "min_score": 0.3}),
            "installed_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "web-search",
            "display_name": "网络搜索",
            "description": "在互联网上搜索最新信息，结果自动保存到知识库",
            "category": "web",
            "version": "1.0.0",
            "is_builtin": True,
            "is_enabled": True,
            "always": False,
            "requires_env": json.dumps(["TAVILY_API_KEY"]),
            "config_schema": json.dumps({"type": "object", "properties": {"max_results": {"type": "integer", "default": 5}, "default_depth": {"type": "string", "enum": ["basic", "advanced"], "default": "basic"}}}),
            "config": json.dumps({"max_results": 5, "default_depth": "basic"}),
            "installed_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "summarize-sources",
            "display_name": "生成摘要",
            "description": "基于笔记本来源内容生成摘要、FAQ、学习指南或简报",
            "category": "knowledge",
            "version": "1.0.0",
            "is_builtin": True,
            "is_enabled": True,
            "always": False,
            "requires_env": None,
            "config_schema": json.dumps({"type": "object", "properties": {"max_chunks": {"type": "integer", "default": 8}}}),
            "config": json.dumps({"max_chunks": 8}),
            "installed_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "create-note-draft",
            "display_name": "创建笔记",
            "description": "直接在笔记本中创建一篇笔记草稿",
            "category": "writing",
            "version": "1.0.0",
            "is_builtin": True,
            "is_enabled": True,
            "always": False,
            "requires_env": None,
            "config_schema": None,
            "config": None,
            "installed_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "generate-mind-map",
            "display_name": "生成思维导图",
            "description": "基于知识库内容生成交互式可视化思维导图",
            "category": "knowledge",
            "version": "1.0.0",
            "is_builtin": True,
            "is_enabled": True,
            "always": False,
            "requires_env": None,
            "config_schema": json.dumps({"type": "object", "properties": {"default_depth": {"type": "integer", "enum": [2, 3], "default": 2}}}),
            "config": json.dumps({"default_depth": 2}),
            "installed_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "update-user-preference",
            "display_name": "记录用户偏好",
            "description": "记录用户明确表达的偏好到记忆系统",
            "category": "memory",
            "version": "1.0.0",
            "is_builtin": True,
            "is_enabled": True,
            "always": True,
            "requires_env": None,
            "config_schema": None,
            "config": None,
            "installed_at": now,
        },
    ]

    for s in skills:
        conn.execute(
            sa.text(
                "INSERT INTO skill_installs "
                "(id, name, display_name, description, category, version, "
                "is_builtin, is_enabled, always, requires_env, config_schema, config, installed_at) "
                "VALUES "
                "(:id, :name, :display_name, :description, :category, :version, "
                ":is_builtin, :is_enabled, :always, "
                "CAST(:requires_env AS jsonb), CAST(:config_schema AS jsonb), CAST(:config AS jsonb), "
                ":installed_at) "
                "ON CONFLICT (name) DO NOTHING"
            ),
            s,
        )


def downgrade() -> None:
    op.drop_index("ix_user_skill_configs_user_skill", table_name="user_skill_configs")
    op.drop_table("user_skill_configs")
    op.drop_index("ix_skill_installs_name", table_name="skill_installs")
    op.drop_table("skill_installs")
