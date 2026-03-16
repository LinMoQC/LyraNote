# LyraNote Skills 插件系统设计文档

> 设计日期：2026-03-10  
> 参考：OpenClaw / AgentSkills 规范  
> 目标：将硬编码的工具层升级为动态可插拔的 Skill 单元，支持启用/禁用、配置化、以及未来的外部安装扩展

---

## 一、背景与动机

### 1.1 当前问题

LyraNote 的 Agent 工具层（`api/app/agents/tools.py`）完全静态硬编码：

```
TOOL_SCHEMAS: list[dict] = [...]   # 6个固定工具Schema
_EXECUTORS: dict = {...}           # 6个固定执行函数
```

**四个核心痛点：**

| 痛点 | 影响 |
|------|------|
| 工具数量固定，添加新工具需改代码 | 扩展成本高，每次需重启服务 |
| 无法按用户/笔记本粒度启用/禁用工具 | 灵活性差，比如部分用户不需要网络搜索 |
| 工具无配置化支持 | 例如 web_search 的 max_results 无法用户自定义 |
| 无法加载外部扩展工具 | 不支持社区贡献的 Skill |

### 1.2 OpenClaw 的启发

[OpenClaw](https://docs.openclaw.ai) 是一个开源 AI Agent 框架，其 Skills 系统的核心设计：

1. **SKILL.md 即单元**：每个 Skill 是含 YAML frontmatter 的 Markdown 文件，同时作为 AI 指令和元数据载体
2. **三层加载优先级**：
   - `workspace/skills/`（最高，agent 私有）
   - `~/.openclaw/skills/`（用户全局管理）
   - 内置 bundled skills（最低，随安装附带）
3. **运行时过滤（Gating）**：按 `requires.env`、`requires.bins` 在加载时自动筛除不满足条件的技能
4. **ClawHub 注册中心**：类似 npm 的社区技能市场，`clawhub install <skill>` 一键安装

### 1.3 LyraNote 的适配策略

LyraNote 是 Python FastAPI 后端，Skills 不仅是文档描述，还需要真正执行 Python 异步逻辑。因此采用 **SKILL.md（元数据 + AI 指令）+ Python 执行器的混合架构**：

- Schema（OpenAI function-calling 格式）与 OpenClaw 兼容
- 三层加载逻辑对应 workspace/user/bundled
- Gating 机制对应 `requires_env` 字段检查
- 数据库存储 enable/disable 状态，对应 OpenClaw 的 `openclaw.json` 配置

---

## 二、总体架构

```
┌─────────────────────────────────────────────────────┐
│                   加载层（三级优先级）                  │
│                                                     │
│  workspace  ──┐                                     │
│  ./skills/*.py│                                     │
│               ├──► SkillRegistry ──► 过滤(Gating)   │
│  user-managed │    (运行时单例)      requires_env    │
│  ~/.lyranote/ │                     is_enabled      │
│               │                     config check   │
│  bundled      │                                     │
│  app/skills/  ┘                                     │
│  builtin/                                           │
└─────────────────────────────────────────────────────┘
                         │
                         ▼ 活跃 Skills 列表
┌─────────────────────────────────────────────────────┐
│                   ReAct Agent 层                     │
│                                                     │
│  tool_schemas = [s.get_schema() for s in active]   │
│  system_prompt += format_skills_for_prompt(active)  │
│  execute_tool(name, args, ctx)                      │
└─────────────────────────────────────────────────────┘
```

---

## 三、数据模型

### 3.1 `skill_installs` 表（全局技能状态）

```python
class SkillInstall(Base):
    __tablename__ = "skill_installs"

    id              = UUID, primary_key
    name            = String(100), unique, not_null   # 技能标识符，如 "web_search"
    display_name    = String(200)                     # 展示名称
    description     = Text                            # 技能描述
    category        = String(50)                      # knowledge|web|writing|memory|productivity
    version         = String(20), default="1.0.0"
    is_builtin      = Boolean, default=True           # True=内置，False=外部安装
    is_enabled      = Boolean, default=True           # 全局开关
    requires_env    = JSONB                           # ["TAVILY_API_KEY"] 缺少则不加载
    config_schema   = JSONB                           # JSON Schema，定义可配置项
    config          = JSONB                           # 当前配置值
    installed_at    = DateTime
```

**索引**：`unique(name)`

### 3.2 `user_skill_configs` 表（用户级覆盖）

```python
class UserSkillConfig(Base):
    __tablename__ = "user_skill_configs"

    user_id     = UUID, ForeignKey(users.id)
    skill_name  = String(100)                # 对应 skill_installs.name
    is_enabled  = Boolean                   # 用户级开关（覆盖全局）
    config      = JSONB                     # 用户级配置（覆盖全局 config）

    # unique on (user_id, skill_name)
```

### 3.3 迁移文件

`api/alembic/versions/006_skills.py` — 创建上述两张表

---

## 四、核心接口设计

### 4.1 `skills/base.py` — SkillBase 抽象类

```python
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class SkillMeta:
    """每个 Skill 的静态元数据（类似 SKILL.md frontmatter）"""
    name: str                              # 唯一标识，kebab-case，如 "web-search"
    display_name: str                      # 展示名
    description: str                       # 注入 system prompt 的描述
    category: str                          # "knowledge" | "web" | "writing" | "memory" | "productivity"
    version: str = "1.0.0"
    requires_env: list[str] = field(default_factory=list)  # 缺少则 Gating 拦截
    always: bool = False                   # True = 不受 is_enabled 影响，始终加载
    config_schema: dict | None = None      # 可选 JSON Schema，定义可配置项
    thought_label: str = "⚙️ 处理中"       # SSE thought 事件展示文字


class SkillBase(ABC):
    """所有 Skill 必须继承此基类"""
    meta: SkillMeta

    def get_schema(self, config: dict | None = None) -> dict:
        """
        返回 OpenAI function-calling 兼容的 schema dict。
        config 参数允许运行时动态调整 schema（如注入枚举值）。
        """
        raise NotImplementedError

    @abstractmethod
    async def execute(self, args: dict, ctx: "ToolContext") -> str:
        """执行 Skill 逻辑，返回字符串结果供 LLM 继续推理"""
        ...

    def passes_gating(self) -> bool:
        """检查 requires_env 中的环境变量是否都存在"""
        import os
        return all(os.environ.get(env) for env in self.meta.requires_env)
```

### 4.2 `skills/registry.py` — SkillRegistry

```python
class SkillRegistry:
    """
    单例。管理所有 Skill 的加载、过滤、执行。
    
    加载优先级（同名时 workspace 覆盖 user，user 覆盖 bundled）：
      1. workspace skills   → ./skills/*.py
      2. user-managed skills → ~/.lyranote/skills/*.py
      3. bundled skills     → app/skills/builtin/
    """

    def register(self, skill: SkillBase) -> None:
        """注册一个 Skill（bundled 在服务启动时调用）"""

    def register_from_dir(self, path: str, override: bool = True) -> int:
        """
        从目录动态加载 Skill Python 文件。
        每个文件需暴露 skill = MySkill() 模块变量。
        返回成功加载的 Skill 数量。
        """

    async def get_active_skills(
        self,
        user_id: UUID,
        db: AsyncSession,
    ) -> list[SkillBase]:
        """
        按优先级加载 → Gating 过滤 → DB enable/disable 过滤。
        结果缓存在 session 级别（对应 OpenClaw 的 session snapshot）。
        """

    async def execute(
        self,
        skill_name: str,
        args: dict,
        ctx: ToolContext,
    ) -> str:
        """统一执行入口，替换 tools.py 中的 _EXECUTORS dispatch"""

    def format_skills_for_prompt(self, skills: list[SkillBase]) -> str:
        """
        将活跃 Skills 列表序列化为 XML 注入 system prompt（对应 OpenClaw 的 formatSkillsForPrompt）。
        
        输出格式：
        <skills>
          <skill name="web-search" category="web">在互联网搜索最新信息</skill>
          <skill name="generate-mind-map" category="knowledge">生成交互式思维导图</skill>
        </skills>
        
        Token 成本：约 195 + Σ(97 + len(name) + len(desc)) 字符，与 OpenClaw 计算公式一致。
        """
```

---

## 五、内置 Skill 规格

将现有 `tools.py` 中的 6 个工具重构为独立的 Skill 类，存放于 `api/app/skills/builtin/`。

### 5.1 目录结构

```
api/app/skills/
├── __init__.py
├── base.py
├── registry.py
└── builtin/
    ├── __init__.py              # 注册所有内置 skills
    ├── search_knowledge.py      # search_notebook_knowledge
    ├── web_search.py            # web_search
    ├── summarize.py             # summarize_sources
    ├── create_note.py           # create_note_draft
    ├── update_preference.py     # update_user_preference
    └── mind_map.py              # generate_mind_map
```

每个文件同级放一个 `SKILL.md`（AgentSkills 兼容格式）：

```
api/app/skills/builtin/
├── SKILL.search_knowledge.md
├── SKILL.web_search.md
...
```

### 5.2 内置 Skill 详细规格

| Skill 名称 | 分类 | requires_env | always | 可配置项 |
|-----------|------|-------------|--------|---------|
| `search-notebook-knowledge` | knowledge | — | `true`（核心能力，不可禁用） | `top_k`（默认5）, `min_score`（默认0.3） |
| `web-search` | web | `TAVILY_API_KEY` | `false` | `max_results`（默认5）, `default_depth`（basic/advanced） |
| `summarize-sources` | knowledge | — | `false` | `max_chunks`（默认8） |
| `create-note-draft` | writing | — | `false` | — |
| `update-user-preference` | memory | — | `true`（记忆核心，不可禁用） | — |
| `generate-mind-map` | knowledge | — | `false` | `default_depth`（默认2） |

### 5.3 Skill 类示例（以 web_search 为例）

```python
# api/app/skills/builtin/web_search.py

from app.skills.base import SkillBase, SkillMeta

class WebSearchSkill(SkillBase):
    meta = SkillMeta(
        name="web-search",
        display_name="网络搜索",
        description=(
            "在互联网上搜索最新信息。当笔记本知识库中没有足够信息，"
            "或用户明确要求搜索网络时调用。搜索结果会自动保存到知识库。"
        ),
        category="web",
        requires_env=["TAVILY_API_KEY"],
        thought_label="🌐 正在搜索网络",
        config_schema={
            "type": "object",
            "properties": {
                "max_results": {"type": "integer", "default": 5, "minimum": 1, "maximum": 10},
                "default_depth": {"type": "string", "enum": ["basic", "advanced"], "default": "basic"},
            }
        }
    )

    def get_schema(self, config: dict | None = None) -> dict:
        cfg = config or {}
        return {
            "name": "web_search",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "search_depth": {
                        "type": "string",
                        "enum": ["basic", "advanced"],
                        "description": f"搜索深度（默认 {cfg.get('default_depth', 'basic')}）",
                    },
                },
                "required": ["query"],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        # ... 原 _exec_web_search 逻辑迁移至此 ...

skill = WebSearchSkill()   # 模块级实例，供 registry.register_from_dir() 发现
```

### 5.4 SKILL.md 格式示例（AgentSkills 兼容）

```markdown
---
name: web-search
description: Search the internet for up-to-date information via Tavily API
metadata:
  {"openclaw": {"requires": {"env": ["TAVILY_API_KEY"]}, "category": "web", "emoji": "🌐"}}
---

Use this skill to search the web when the notebook knowledge base lacks sufficient information,
or when the user explicitly asks for latest news or real-time data.

Search results are automatically saved to the notebook for future retrieval.
```

---

## 六、ReAct Agent 改造

### 6.1 `react_agent.py` — 动态加载 Schemas

```python
# 当前（静态）
from app.agents.tools import TOOL_SCHEMAS, execute_tool
response = await chat_with_tools(messages, TOOL_SCHEMAS)

# 改造后（动态）
from app.skills.registry import skill_registry

active_skills = await skill_registry.get_active_skills(user_id, db)
tool_schemas = [s.get_schema(config=await _get_skill_config(s.meta.name, user_id, db))
                for s in active_skills]
skill_prompt_section = skill_registry.format_skills_for_prompt(active_skills)

# skill_prompt_section 追加到 system_prompt
response = await chat_with_tools(messages, tool_schemas)
```

### 6.2 `tools.py` — 降级为薄包装层

原 `tools.py` 改造为向后兼容的包装器，内部委托给 `skill_registry`：

```python
# 保留 ToolContext（react_agent 仍然使用）
# TOOL_SCHEMAS 改为从 registry 动态获取的属性
# execute_tool 委托给 skill_registry.execute()
```

---

## 七、REST API 设计

新增 `api/app/domains/skill/router.py`，前缀 `/api/v1/skills`：

### 7.1 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/skills` | 列出所有已注册技能（含状态和配置） |
| `GET` | `/skills/{name}` | 获取某技能详情、config_schema 和当前配置 |
| `PUT` | `/skills/{name}` | 全局启用/禁用某技能（或更新 config） |
| `GET` | `/skills/user` | 获取当前用户的技能覆盖配置 |
| `PUT` | `/skills/user/{name}` | 用户级启用/禁用或自定义配置 |

### 7.2 GET /skills 响应示例

```json
[
  {
    "name": "web-search",
    "display_name": "网络搜索",
    "category": "web",
    "version": "1.0.0",
    "is_builtin": true,
    "is_enabled": true,
    "always": false,
    "requires_env": ["TAVILY_API_KEY"],
    "env_satisfied": true,
    "config": {"max_results": 5, "default_depth": "basic"},
    "config_schema": {...},
    "user_override": null
  },
  {
    "name": "generate-mind-map",
    "is_enabled": true,
    "user_override": {"is_enabled": false}
  }
]
```

---

## 八、三层加载的实现细节

### 8.1 加载时序

服务启动时：

```
1. SkillRegistry 初始化
2. 注册 bundled skills（builtin/）
3. 注册 user-managed skills（~/.lyranote/skills/）
4. 注册 workspace skills（./skills/）
5. 同名技能按优先级覆盖
```

请求时（`get_active_skills`）：

```
1. 所有注册技能 → Gating 过滤（requires_env 检查）
2. Gating 通过 → 查询 DB skill_installs.is_enabled
3. DB 启用 → 查询用户级 user_skill_configs 覆盖
4. 合并配置 → 返回最终活跃 Skills 列表
```

### 8.2 外部 Skill 安装（未来扩展）

预留扩展口：Skill 文件可以是 Python 包（安装到 `~/.lyranote/skills/`）：

```bash
# 未来的 LyraClaw CLI（对标 clawhub install）
lyranote skills install notion-sync
lyranote skills install github-copilot-bridge
lyranote skills list
lyranote skills disable web-search
```

安装本质是：将 Skill Python 包解压到 `~/.lyranote/skills/<skill-name>/`，registry 在下次请求时自动发现并加载。

### 8.3 热重载（对应 OpenClaw Skills Watcher）

可选：使用 `watchfiles` 库监听 `./skills/` 目录变更，无需重启服务即可加载新 Skill 文件（开发模式下特别有用）。

---

## 九、实施计划

### Phase 1 — 架构重构（不改变外部行为）

| 任务 | 文件 | 工时 |
|------|------|------|
| 创建 SkillBase + SkillMeta | `skills/base.py` | 1h |
| 创建 SkillRegistry（单层加载） | `skills/registry.py` | 2h |
| 将 6 个工具重构为 builtin Skill 类 | `skills/builtin/*.py` | 2h |
| 改造 tools.py 为薄包装 | `agents/tools.py` | 1h |
| react_agent.py 集成 registry | `agents/react_agent.py` | 1h |

Phase 1 完成后，外部 API 行为不变，内部变为插件化架构。

### Phase 2 — 数据库 + API

| 任务 | 文件 | 工时 |
|------|------|------|
| 新建 SkillInstall + UserSkillConfig 模型 | `models.py` | 0.5h |
| 编写迁移文件 | `alembic/versions/006_skills.py` | 0.5h |
| SkillRegistry 接入 DB 过滤 | `skills/registry.py` | 1h |
| 技能管理 REST API | `domains/skill/router.py` | 2h |

### Phase 3 — 三层加载 + SKILL.md

| 任务 | 文件 | 工时 |
|------|------|------|
| 实现 register_from_dir（动态加载外部 Skill） | `skills/registry.py` | 1.5h |
| 为每个内置 Skill 编写 SKILL.md | `skills/builtin/*.md` | 1h |
| format_skills_for_prompt（XML 注入） | `skills/registry.py` | 1h |

---

## 十、毕设论文价值点

1. **插件化架构设计**：展示 Open/Closed 原则在 AI Agent 层的应用，技能可扩展而无需修改核心代码
2. **对比 OpenClaw**：LyraNote Skills 架构与 OpenClaw AgentSkills 规范的对比分析（JS vs Python 的实现差异、SKILL.md 格式兼容性）
3. **动态能力演化**：结合 Memory V2 的 L3-skills 层，Skill 系统本身的安装状态可以成为用户能力画像的一部分（用户安装了哪些 Skill = 用户的工作流偏好信号）
4. **可量化的扩展性**：记录添加一个新 Skill 所需的代码量（理论上只需写一个新的 Python 类，约 50-80 行），与改造前的对比
