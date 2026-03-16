# LyraNote 记忆系统 V2 设计文档

> 核心命题：让 LyraNote 成为"越来越懂用户的 AI 笔记"  
> 设计日期：2026-03-10  
> 参考架构：AI-Infra 五层架构（L1-tools → L5-reflections）

---

## 一、现状分析

### 1.1 当前记忆层架构

当前的记忆系统（V1）停留在五层架构的 **L2-context** 层，本质是一个"被动观测 + 静态存储"的系统。

**数据模型**：
- `user_memories` 表：6 个固定 key（`writing_style` / `interest_topic` / `technical_level` / `preferred_lang` / `domain_expertise` / `output_preference`）
- `notebook_summaries` 表：笔记本语义摘要 + 核心关键词

**触发机制**：
- 每次 SSE 对话结束后异步触发 `extract_user_memories()`（取最近 30 条消息）
- Source ingestion 完成后触发 `refresh_notebook_summary()`

**注入机制**：
- 加载 confidence ≥ 0.3 的所有记忆，拼接后注入 System Prompt（全量注入，无相关性过滤）

### 1.2 六大核心缺陷

| 缺陷 | 说明 |
|------|------|
| Key 类型固化 | 只有 6 个 key，无法捕捉"用户正在研究的课题"、"已有错误认知"等细粒度事实 |
| 记忆永不衰减 | 旧偏好永久有效，用户习惯改变后旧记忆仍然干扰回答 |
| 无冲突保护 | 同一 key 直接覆盖，低置信新值可能覆盖高置信旧值 |
| 触发点缺失 | Note 创建/更新不触发 Summary 刷新；`/ai/deep-research` 不注入用户记忆 |
| 无场景感知 | 不区分用户当前在做什么（深度研究 vs 快速查阅），用同一套策略应对所有场景 |
| 无自我反思 | AI 不评估自己的回答质量，不知道哪些记忆"有用"、哪些"没用" |

---

## 二、设计目标：五层记忆体系

受 AI-Infra 五层架构启发，将 LyraNote 记忆系统升级如下：

```
L5-reflections  →  反思进化层（AI 评估自身表现，强化有效记忆）
L4-scenes       →  场景感知层（识别用户当前意图场景，适配回答策略）
L3-skills       →  用户能力画像（细粒度事实记忆：知识点/课题/错误认知）
L2-context      →  偏好记忆（写作风格/技术水平等，带衰减机制）
L1-tools        →  工具层（已有，不变）
```

### 2.1 五层架构对应关系

| 五层架构 | AI-Infra 子模块 | LyraNote 实现 | 状态 |
|---------|----------------|--------------|------|
| L1-tools | - | search / write / web_search 等工具 | 已有 |
| L2-context | - | 偏好记忆（扩展 user_memories 表） | 改造 |
| L3-skills | - | 事实/技能记忆（memory_type=fact/skill） | 新增 |
| L4-scenes | - | scene_detector.py 场景分类器 | 新增 |
| L5-reflections | ai-evolution | AgentReflection 表，演化历史 | 新增 |
| L5-reflections | up-rating | 有效记忆 confidence 强化 | 新增 |
| L5-reflections | system-detection | 检测失效/冲突记忆 | 新增 |

---

## 三、数据模型设计

### 3.1 扩展 `user_memories` 表

在现有字段基础上新增：

```python
# models.py - UserMemory 新增字段
memory_type      = Column(String(20), default="preference")
# 取值：preference（偏好）| fact（事实）| skill（技能画像）

access_count     = Column(Integer, default=0)
# 被注入到 System Prompt 的累计次数

last_accessed_at = Column(DateTime(timezone=True))
# 最后一次被注入使用的时间

expires_at       = Column(DateTime(timezone=True), nullable=True)
# 事实性记忆（fact）可设置过期时间，偏好记忆留空

reinforced_by    = Column(String(36), nullable=True)
# 最近一次强化该记忆的 AgentReflection.id（用于追溯）
```

`memory_type` 说明：
- `preference`：用户稳定偏好（写作风格、技术水平等），无 TTL
- `fact`：用户当前状态相关事实（正在研究的课题、今天讨论的问题），有 TTL（默认 30 天）
- `skill`：用户已掌握/欠缺的知识领域，由 L5 反思层写入，中等 TTL（90 天）

### 3.2 新增 `agent_reflections` 表（L5 核心）

```python
# models.py - AgentReflection 新表
class AgentReflection(Base):
    __tablename__ = "agent_reflections"

    id               = Column(UUID, primary_key=True)
    user_id          = Column(String, ForeignKey("users.id"))
    conversation_id  = Column(UUID, ForeignKey("conversations.id"))
    scene            = Column(String(20))
    # 本次对话识别到的场景：research | writing | learning | review

    quality_score    = Column(Float)
    # 0.0-1.0，LLM 对本次回答质量的自评分

    what_worked      = Column(Text)
    # 哪些记忆/策略让本次回答更准确（自然语言描述）

    what_failed      = Column(Text)
    # 哪些地方答非所问或不符合用户期望

    memory_reinforced = Column(JSONB)
    # 被验证有效并执行 up-rating 的记忆 key 列表
    # 例如：["technical_level", "research_focus_2026q1"]

    created_at       = Column(DateTime(timezone=True))
```

---

## 四、核心模块设计

### 4.1 `agents/memory.py`（改造）

#### 记忆提取 Prompt 升级

旧 Prompt 仅提取 6 个固定 key。新 Prompt 要求 LLM 同时输出两类结构：

```json
{
  "preferences": [
    {
      "key": "writing_style",
      "value": "简洁直接，偏好 bullet points",
      "confidence": 0.85
    }
  ],
  "facts": [
    {
      "key": "current_research_topic",
      "value": "RAG 系统中的记忆机制设计",
      "confidence": 0.9,
      "ttl_days": 30
    },
    {
      "key": "known_misconception",
      "value": "用户认为向量检索可以完全替代关键词检索",
      "confidence": 0.6,
      "ttl_days": 14
    }
  ]
}
```

#### 记忆冲突解决

写入前对比 confidence，避免低置信新值覆盖高置信旧值：

```python
async def _upsert_with_conflict_resolution(session, user_id, key, new_value, new_confidence, memory_type):
    existing = await _get_memory(session, user_id, key)
    if existing:
        # 新值置信度必须超过旧值 0.15 才能覆盖
        if existing.confidence > new_confidence + 0.15:
            return  # 保留旧值
        # 合并更新
        existing.value = new_value
        existing.confidence = new_confidence
        existing.updated_at = datetime.utcnow()
    else:
        # 全新记忆，直接插入
        session.add(UserMemory(...))
```

#### 记忆衰减（由 Celery Beat 每日触发）

```python
async def decay_stale_memories(user_id: str, session):
    threshold_date = datetime.utcnow() - timedelta(days=60)
    stale_memories = session.query(UserMemory).filter(
        UserMemory.user_id == user_id,
        UserMemory.last_accessed_at < threshold_date,
        UserMemory.access_count < 3,
        UserMemory.memory_type == "preference"  # 偏好记忆才衰减
    )
    for memory in stale_memories:
        memory.confidence -= 0.1
        if memory.confidence < 0.2:
            session.delete(memory)

    # 清理已过期的 fact 记忆
    session.query(UserMemory).filter(
        UserMemory.user_id == user_id,
        UserMemory.expires_at < datetime.utcnow()
    ).delete()
```

#### 上下文感知注入（替换全量注入）

```python
async def build_memory_context(user_id: str, current_query: str, session, top_k: int = 5) -> str:
    # 1. 加载所有 confidence >= 0.3 的记忆
    all_memories = await _load_all_memories(session, user_id, min_confidence=0.3)
    if not all_memories:
        return ""

    # 2. 对每条记忆的 value 做 embedding（批量）
    memory_embeddings = await batch_embed([m.value for m in all_memories])

    # 3. 与当前 query 计算 cosine 相似度
    query_embedding = await embed(current_query)
    scored = [(m, cosine_sim(query_embedding, emb)) for m, emb in zip(all_memories, memory_embeddings)]
    scored.sort(key=lambda x: x[1], reverse=True)

    # 4. 取 Top-K，并更新 access_count 和 last_accessed_at
    top_memories = scored[:top_k]
    await _update_access_stats(session, [m.id for m, _ in top_memories])

    return _format_memory_context(top_memories)
```

---

### 4.2 `agents/scene_detector.py`（新增，L4）

在每次对话的第一条消息进入时，用极轻量的分类 Prompt 识别场景：

```python
SCENE_LABELS = {
    "research": "用户在深度探索一个新领域，提出的问题较为开放或复杂",
    "writing":  "用户在创作内容，请求续写、润色或提供写作建议",
    "learning": "用户在学习/消化某个知识点，需要解释或举例",
    "review":   "用户在快速查找已知信息，需要精确简短的答案"
}

SCENE_SYSTEM_INSTRUCTIONS = {
    "research": "优先给出多角度的结构化分析，引用笔记本中已有的相关内容，适当提出延伸问题。",
    "writing":  "保持用户写作风格和语气，给出自然流畅的建议，避免过度解释。",
    "learning": "用类比和具体例子帮助理解，适当检验用户是否已理解，循序渐进。",
    "review":   "给出精确、简短的答案，不做不必要的展开，尽快命中用户需要的点。"
}

async def detect_scene(query: str, conversation_history: list) -> str:
    # temperature=0，max_tokens=10，只输出场景标签
    # 代价极低（< 50 tokens），不影响主流程延迟
    ...
```

---

### 4.3 `agents/reflection.py`（新增，L5）

每次对话 SSE 流结束后，与 `extract_user_memories` **并行**异步执行：

```python
async def reflect_on_conversation(conversation_id: str, user_id: str, scene: str, session):
    messages = await _load_conversation_messages(session, conversation_id)

    reflection_prompt = f"""
    你刚刚完成了一次对话（场景：{scene}）。请对自己的表现进行评估：

    1. quality_score（0.0-1.0）：整体回答质量，是否准确命中用户需求
    2. what_worked：哪些关于用户的信息让你的回答更准确、更贴合用户
    3. what_failed：哪些地方你的回答偏离了用户期望，或者使用了错误的假设
    4. memory_reinforced：列出在 what_worked 中提到的记忆 key（如 technical_level、writing_style 等）

    输出 JSON 格式。
    """

    result = await llm_call(messages + [{"role": "user", "content": reflection_prompt}], temperature=0.1)

    # 写入反思记录
    reflection = AgentReflection(
        user_id=user_id,
        conversation_id=conversation_id,
        scene=scene,
        **parse_reflection(result)
    )
    session.add(reflection)

    # up-rating：强化有效记忆
    for key in reflection.memory_reinforced:
        await _reinforce_memory(session, user_id, key, delta=+0.1, reinforced_by=reflection.id)

    # system-detection：标记可能失效的记忆（根据 what_failed 分析）
    failed_keys = await _detect_stale_from_failure(result["what_failed"], user_id, session)
    for key in failed_keys:
        await _decay_memory(session, user_id, key, delta=-0.1)
```

---

## 五、API 设计

### 5.1 新增记忆管理端点

**路由前缀**：`/memory`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/memory` | 获取当前用户所有记忆，按 memory_type 分组 |
| `GET` | `/memory/reflections` | 获取 AI 反思历史（按时间倒序，最近 30 条） |
| `PUT` | `/memory/{id}` | 用户手动修正某条记忆的 value |
| `DELETE` | `/memory/{id}` | 用户删除某条记忆 |
| `POST` | `/memory/reset` | 重置所有记忆（GDPR 友好） |

**`GET /memory` 响应示例**：

```json
{
  "preferences": [
    {
      "id": "uuid",
      "key": "writing_style",
      "value": "简洁直接，偏好 bullet points",
      "confidence": 0.85,
      "access_count": 23,
      "last_accessed_at": "2026-03-08T14:32:00Z"
    }
  ],
  "facts": [
    {
      "id": "uuid",
      "key": "current_research_topic",
      "value": "RAG 系统中的记忆机制设计",
      "confidence": 0.9,
      "expires_at": "2026-04-08T00:00:00Z"
    }
  ],
  "skills": []
}
```

**`GET /memory/reflections` 响应示例**：

```json
[
  {
    "id": "uuid",
    "scene": "research",
    "quality_score": 0.82,
    "what_worked": "准确识别用户的技术背景，使用了合适的专业术语",
    "what_failed": "没有意识到用户已经了解 RAG 基础，过多解释了基本概念",
    "memory_reinforced": ["technical_level", "domain_expertise"],
    "created_at": "2026-03-10T10:15:00Z"
  }
]
```

---

## 六、对话流程（改造后）

```
用户发送消息
    │
    ├─► [L4] scene_detector.detect_scene()         # ~50 tokens，极低延迟
    │         │
    │         └─► scene = "research" / "writing" / "learning" / "review"
    │
    ├─► [L2/L3] memory.build_memory_context()      # embedding Top-K 筛选
    │         │
    │         └─► 最相关的 Top-5 记忆条目
    │
    ├─► 组装 System Prompt
    │     = 场景指令 + Top-K 记忆 + Notebook Summary
    │
    ├─► ReAct Agent 执行（已有逻辑，不变）
    │
    └─► SSE 流式输出给用户
           │
           └─► 对话结束后，并行异步执行：
                 ├─ extract_user_memories()    [L2/L3 记忆提取]
                 └─ reflect_on_conversation()  [L5 反思 + up-rating]
```

---

## 七、实施优先级

按投入产出比排序：

| 优先级 | 任务 | 预估工时 | 核心价值 |
|--------|------|---------|---------|
| P0 | 修复触发缺口（Note→Summary + DeepResearch→Memory注入） | 1h | 修复现有 Bug |
| P1 | 记忆提取升级（preferences+facts 双输出 Prompt） | 3h | 显著提升记忆丰富度 |
| P1 | 上下文感知注入（embedding Top-K 替换全量注入） | 2h | 提升注入精准度 |
| P2 | 冲突解决 + 衰减机制 | 2h | 提升记忆健壮性 |
| P2 | L4 场景探测器 | 2h | 回答策略个性化 |
| P3 | L5 反思层（AgentReflection + up-rating） | 4h | 核心创新点，毕设亮点 |
| P3 | 记忆管理 REST API + 前端面板 | 3h | 用户可解释性 |

---

## 八、毕设论文价值点

1. **创新性**：将 AI-Infra 五层架构中的 L4/L5 概念落地到实际笔记应用，目前学术界此方向处于早期
2. **可量化指标**：可用 `quality_score` 均值的变化（随使用次数增长）来量化"AI 越来越懂用户"
3. **可视化**：`agent_reflections` 表的演化历史是一个天然的可视化图表来源
4. **对比实验**：可以构造"开启记忆 vs 关闭记忆"、"V1静态记忆 vs V2动态进化记忆"的消融实验
