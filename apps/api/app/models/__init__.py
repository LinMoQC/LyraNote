"""
app.models package — re-exports every ORM model so that existing
`from app.models import Foo` imports continue to work unchanged.
"""

from app.database import Base  # re-exported for alembic env.py compatibility
from app.models._base import uuid_pk, now_col

from app.models.user import User, AppConfig
from app.models.notebook import Notebook, NotebookSummary
from app.models.source import Source, Chunk
from app.models.note import Note
from app.models.conversation import (
    Conversation,
    Message,
    ConversationSummary,
    MessageFeedback,
)
from app.models.artifact import Artifact
from app.models.memory import (
    UserMemory,
    AgentRun,
    AgentReflection,
    AgentEvaluation,
    AgentThought,
    UserPortrait,
)
from app.models.skill import SkillInstall, UserSkillConfig
from app.models.task import ScheduledTask, ScheduledTaskRun, ResearchTask
from app.models.knowledge import KnowledgeEntity, KnowledgeRelation, ProactiveInsight
from app.models.mcp import MCPServerConfig
from app.models.public_home import PublicHomeState

__all__ = [
    "Base",
    "uuid_pk",
    "now_col",
    # user
    "User",
    "AppConfig",
    # notebook
    "Notebook",
    "NotebookSummary",
    # source / vector
    "Source",
    "Chunk",
    # note
    "Note",
    # conversation
    "Conversation",
    "Message",
    "ConversationSummary",
    "MessageFeedback",
    # artifact
    "Artifact",
    # memory / agent
    "UserMemory",
    "AgentRun",
    "AgentReflection",
    "AgentEvaluation",
    "AgentThought",
    "UserPortrait",
    # skills
    "SkillInstall",
    "UserSkillConfig",
    # tasks
    "ScheduledTask",
    "ScheduledTaskRun",
    "ResearchTask",
    # knowledge graph + insights
    "KnowledgeEntity",
    "KnowledgeRelation",
    "ProactiveInsight",
    # mcp
    "MCPServerConfig",
    # public home
    "PublicHomeState",
]
