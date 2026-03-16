# Deep Research 功能设计文档

## 1. 背景与定位

### 什么是 Deep Research

Deep Research 是一种**多步骤、自主式的 AI 研究能力**，与普通问答（Ask）的本质区别在于：它不是直接回答一个问题，而是像一个研究员一样，先制定研究计划，再迭代搜集证据，最终合成一份带完整引用的结构化报告。

OpenAI 的 Deep Research 产品可以在 30 分钟内完成人类研究员需要 6-8 小时才能完成的工作，其核心技术路线已被业界广泛研究和复现。

### 与现有功能的对比

| 维度 | 普通 Ask（当前） | Deep Research（规划中） |
|---|---|---|
| 执行轮次 | 单轮（1 次 LLM 调用 + RAG） | 多轮（规划 + N 层迭代 + 综合） |
| 执行时间 | 秒级（< 10s） | 分钟级（20s - 5min） |
| 知识来源 | 内部 RAG 优先，可选 Web Search | 内部 RAG + 多次 Web Search 并行 |
| 输出格式 | 对话消息（流式） | 结构化 Markdown 报告（Artifact） |
| 交互方式 | 同步流式 SSE | 异步后台任务 + 实时进度 SSE |
| 引用质量 | 基于 RAG 检索分数 | 按信息点逐一标注来源 |
| 适用场景 | 快速提问、解释概念 | 综述调研、对比分析、系统性梳理 |

---

## 2. 业界实现参考

### 2.1 OpenAI Deep Research 的五阶段模型

基于公开的系统卡和技术分析，OpenAI Deep Research 遵循以下流程：

```
Phase 1: Clarify     ── 追问用户 1-2 个澄清性问题，明确研究意图
Phase 2: Plan        ── 内部将高层问题分解为若干子议题，规划研究策略
Phase 3: Iterate     ── 迭代执行搜索，每轮查询词基于上轮发现动态更新
Phase 4: Read        ── 深度解析 HTML / PDF / 图片，可运行代码计算
Phase 5: Synthesize  ── 综合所有发现，生成带内联引用的结构化报告
```

关键工程限制（防止无限循环）：
- 最多执行 30-60 次 Web Search
- 最多读取 120-150 个页面
- 时间上限 20-30 分钟

### 2.2 dzhng/deep-research 的递归深度-广度算法

这是 GitHub 上 18k+ stars 的最简洁开源实现，核心是两个控制参数：

- `breadth`（广度）：每一层并行生成几个搜索查询
- `depth`（深度）：递归层数，决定研究的深入程度

算法流程：

```
输入: 问题 Q, depth=2, breadth=3

第 1 层 (depth=2):
  LLM 生成 3 个搜索词 → 并行搜索 → 提取 3 组"关键发现 + 新研究方向"

第 2 层 (depth=1):
  基于第1层的新方向，再生成 3 个搜索词 → 并行搜索 → 提取发现

第 3 层 (depth=0):
  达到最大深度，停止递归

汇总阶段:
  将所有层的"关键发现"输入 LLM，生成 Markdown 报告
```

**关键洞察**：每一层的搜索词都是由上一层的「发现」动态生成的，因此越往深处越聚焦、越专业。这比一次性规划所有问题效果更好。

### 2.3 LangChain open_deep_research 的 Scope-Research-Write 三段式

LangChain 的实现将流程简化为三个明确阶段：

1. **Scope** — 确定研究范围，生成章节大纲
2. **Research** — 对每个章节并行执行检索
3. **Write** — 按大纲逐章撰写，最后拼合

这种方式输出的报告结构更规整，适合需要固定格式的场景（学术综述、竞品分析报告）。

---

## 3. LyraNote 的 Deep Research 设计方案

### 3.1 设计原则

1. **双源优先**：优先使用用户私有知识库（pgvector RAG），当内部检索置信度不足时才触发 Tavily Web Search。这既节省成本，又使输出更贴合用户自己的知识体系。
2. **渐进式反馈**：通过 SSE 实时推送每一个研究步骤，让用户看到"思考过程"。
3. **预算可控**：提供两个预设模式，用户不感知深度/广度参数。
4. **结果可复用**：输出保存为 Artifact，可一键插入编辑器，并与笔记本关联。

### 3.2 整体架构

```
用户提交问题
     │
     ▼
POST /api/v1/ai/deep-research
     │  返回 { task_id }
     │
     ▼
Celery Worker（后台异步任务）
     │
     ├─ Step 1: 规划（Plan）
     │     └─ LLM 分解为 3-5 个子问题 + 为每个子问题选择来源策略
     │
     ├─ Step 2: 执行（Execute）—— 可并行
     │     ├─ 内部 RAG（pgvector 检索）
     │     ├─ 外部搜索（Tavily API，同步返回内容）
     │     └─ LLM 提取「关键发现 + 新研究方向」
     │
     ├─ Step 3: 可选递归（depth > 1 时）
     │     └─ 基于新方向重复 Step 2
     │
     └─ Step 4: 综合（Synthesize）
           ├─ LLM 撰写结构化 Markdown 报告（含内联引用）
           └─ 保存为 Artifact 记录

前端通过 GET /ai/deep-research/{task_id}/stream 接收 SSE 事件
```

### 3.3 SSE 事件协议

```jsonc
// 研究计划生成
{ "type": "plan", "data": { "sub_questions": ["量子计算的基本原理？", "当前主要技术路线？", "..."] } }

// 开始检索某个子问题
{ "type": "searching", "data": { "query": "量子计算基本原理", "source": "rag" } }
{ "type": "searching", "data": { "query": "quantum computing latest breakthroughs 2025", "source": "web" } }

// 提取到关键发现
{ "type": "learning", "data": { "content": "量子纠缠是量子计算的核心机制，允许多量子比特同时处于叠加态..." } }

// 开始撰写报告
{ "type": "writing", "data": {} }

// 报告内容流式输出
{ "type": "token", "data": { "token": "## 量子计算综述\n\n" } }

// 完成
{ "type": "done", "data": { "artifact_id": "uuid-...", "title": "量子计算深度研究报告" } }

// 错误
{ "type": "error", "data": { "message": "搜索服务暂时不可用，已使用内部知识库完成研究" } }
```

### 3.4 后端实现细节

#### 新增文件：`api/app/agents/deep_research.py`

```python
"""
Deep Research Agent
递归深度-广度研究算法，参考 dzhng/deep-research 的核心思路，
结合 LyraNote 的双源知识检索（pgvector + Tavily）。
"""

@dataclass
class ResearchLearning:
    sub_question: str       # 对应的子问题
    content: str            # 提取的关键发现
    citations: list[dict]   # 来源引用（source_id, url, excerpt）
    new_directions: list[str]  # 建议的进一步研究方向

async def plan(query: str, llm_client) -> list[str]:
    """将研究问题分解为 3-5 个子问题"""

async def research_one(
    question: str,
    notebook_id: str | None,
    db: AsyncSession,
    llm_client,
    tavily_client,
    sse_queue: asyncio.Queue,
) -> ResearchLearning:
    """
    对单个子问题执行检索并提取发现。
    策略：先内部 RAG，若相关性分数均低于阈值（0.6）则追加 Web Search。
    """

async def run_deep_research(
    query: str,
    notebook_id: str | None,
    depth: int,    # 1（快速模式）或 2（深度模式）
    breadth: int,  # 通常为 3
    user_id: str,
    db: AsyncSession,
    sse_queue: asyncio.Queue,
) -> str:
    """主入口：递归执行研究并返回最终 Markdown 报告"""
```

#### 修改文件：`api/app/domains/ai/router.py`

新增两个端点：

```python
# 创建研究任务
POST /ai/deep-research
Body: { query, notebook_id?, mode: "quick" | "deep" }
Response: { task_id: str }

# 订阅进度流
GET /ai/deep-research/{task_id}/stream
Response: text/event-stream（SSE）
```

#### Celery 任务（`api/app/workers/tasks.py`）

```python
@celery_app.task(name="deep_research")
def run_deep_research_task(task_id: str, query: str, ...):
    # 将 asyncio 事件循环内的 SSE 事件暂存到 Redis
    # 前端通过 /stream 端点从 Redis 读取并转发给客户端
```

#### 新增 `web_search_sync` 工具

现有 `web_search` 工具会将结果异步入库（用于后续 RAG），Deep Research 需要**立即使用搜索内容**：

```python
async def web_search_sync(query: str, tavily_client) -> list[dict]:
    """
    调用 Tavily，立即返回搜索结果的标题+摘录+URL。
    不入库，不触发 Celery。仅供 Deep Research 的执行层使用。
    """
    result = await tavily_client.search(query, max_results=5, include_raw_content=True)
    return [{ "title": r.title, "content": r.content, "url": r.url } for r in result.results]
```

### 3.5 前端 UI 设计

#### 触发方式

在 Chat 输入框右侧增加模式切换按钮：

```
[ 普通提问 ] vs [ 🔬 深度研究 ]
```

切换到深度研究模式时，输入框边框变色（紫色 → 橙色/琥珀色），placeholder 文字变为"描述你想深入研究的课题…"。

#### 进度面板

研究进行中时，在消息区域展示一个多层次的进度时间轴（复用/扩展现有 `AgentSteps` 组件）：

```
◎ 正在规划研究方向...
  └─ 已分解为 4 个子问题

◉ 子问题 1/4：量子纠缠的基本原理
  ├─ 🗂 检索内部知识库... 找到 3 个相关片段
  └─ ✓ 关键发现：量子纠缠允许粒子间瞬时关联...

◉ 子问题 2/4：主要技术路线对比
  ├─ 🗂 内部知识库相关性不足
  ├─ 🌐 搜索网络：quantum computing roadmap 2025...
  └─ ✓ 关键发现：超导量子比特和光子量子比特是当前主流...

⟳ 正在撰写报告...
```

#### 结果展示

报告生成后以 Artifact 卡片形式呈现：

```
┌─────────────────────────────────────────────────────┐
│  📄 量子计算深度研究报告                              │
│  基于 4 个子问题 · 12 个来源 · 耗时 2分18秒           │
│                                                     │
│  ## 摘要                                            │
│  量子计算利用量子力学原理...                          │
│                              [展开全文] [插入编辑器] │
└─────────────────────────────────────────────────────┘
```

### 3.6 两种预设模式参数

| 模式 | depth | breadth | 最大搜索次数 | 预期耗时 |
|---|---|---|---|---|
| 快速模式（Quick） | 1 | 3 | 3-6 次 | 20-60 秒 |
| 深度模式（Deep） | 2 | 3 | 9-12 次 | 2-5 分钟 |

---

## 4. 核心技术挑战与解决方案

### 4.1 Web Search 的内容延迟问题

**问题**：现有 `web_search` 工具是"搜索 → 后台 Celery 任务入库"，无法在同一个研究会话中立即使用搜索到的内容。

**解决方案**：为 Deep Research 新增 `web_search_sync` 函数，直接调用 Tavily 并立即返回原始内容，跳过入库步骤。如果用户希望将这些来源永久保存到知识库，可在报告生成后提供"保存所有来源"按钮。

### 4.2 Context Window 管理

**问题**：随着研究深度增加，积累的 `learnings` 可能超出 LLM 的 context window。

**解决方案**：
- 每个 learning 提取时进行摘要压缩（限制在 200 字以内）
- 进入综合阶段时只传入 learnings 摘要 + 原始问题，不传完整检索内容
- 最大 learnings 数量上限为 20 条

### 4.3 Celery Worker 与 SSE 的通信

**问题**：Celery 任务在 Worker 进程中运行，前端 SSE 连接在 FastAPI 进程中，两者需要通信。

**解决方案**：使用 Redis 作为消息队列中间件：
- Celery Worker 将 SSE 事件 `LPUSH` 到 `deep_research:{task_id}` 的 Redis List
- FastAPI SSE 端点 `BLPOP` 轮询该 List，实时转发给前端
- 任务完成时推送特殊 `done` 事件，SSE 连接关闭

### 4.4 成本控制

**问题**：Tavily API 按次计费，depth=2/breadth=3 最多触发 12 次搜索。

**解决方案**：
- RAG 检索置信度阈值：内部检索分数 ≥ 0.65 时跳过 Web Search
- 相同关键词去重：同一研究会话中不重复搜索相同关键词
- 用户可在设置中关闭 Web Search，只使用内部知识库进行 Deep Research

---

## 5. 实现路线图

### MVP 版本（已完成）

- [x] 后端：`api/app/agents/deep_research.py` — 核心算法（Plan → Execute → Synthesize）
- [x] 后端：`POST /ai/deep-research` 端点（直接 SSE，同步流式）
- [x] 后端：`web_search_sync` 同步搜索函数（Tavily，不入库）
- [x] 前端：`web/src/services/ai-service.ts` — `startDeepResearch()` + AbortController
- [x] 前端：`web/src/features/chat/deep-research-progress.tsx` — 进度时间轴组件
- [x] 前端：Chat 输入框模式切换（普通 / 深度研究）

### 后续迭代方向

- [ ] 引入 Celery 异步任务，支持页面关闭后继续后台研究
- [ ] 并行化子问题执行（`asyncio.gather`）
- [ ] 研究历史记录（保存 task_id 和报告到数据库）
- [ ] "保存所有 Web 来源到知识库"功能
- [ ] 用户可调节深度/广度参数的高级设置

---

## 6. 增强计划：研究质量与体验升级

> **目标**：让用户看到"过程可见、产出可复用、可反馈可继续"的研究体验，对标 Manus 的研究质感。  
> 分四期落地，Phase 0 纯后端、零前端改动即可上线。

### 6.1 核心问题诊断

当前 MVP 实现的本质是"拆分 → 搜索 → 合并"，存在以下质量瓶颈：

| 问题 | 根因 | 影响 |
|---|---|---|
| 没有研究目标与评价标准 | `plan()` 只拆问题，不定方向 | 输出变成信息拼接，缺乏立场 |
| 搜索策略单一 | 所有子问题使用相同检索策略 | 忽略"最新动态""反例"等维度 |
| 没有论证链路 | `synthesize_report()` 无格式约束 | 缺少对比、反驳、证据强度 |
| 没有中间推理产物 | 发现不分级，所有来源等权 | 报告结论可信度模糊 |
| 产出不可复用 | 仅输出 Markdown 文本 | 无法一键保存/引用/追问 |

---

### 6.2 Phase 0：后端研究流程重构（纯后端，2-3 天）

**文件：`api/app/agents/deep_research.py`**

#### 6.2.1 `Learning` 数据类扩展

```python
@dataclass
class Learning:
    sub_question: str
    content: str
    citations: list[dict] = field(default_factory=list)
    new_directions: list[str] = field(default_factory=list)
    evidence_grade: str = "weak"      # "strong" | "medium" | "weak"
    dimension: str = "concept"        # "concept" | "latest" | "evidence" | "controversy"
    counterpoint: str = ""            # 反例或风险点
```

#### 6.2.2 `plan()` 重写：研究目标 + 四维检索矩阵

现在：返回 3-4 个子问题列表。

改后：返回结构化研究计划，LLM prompt 要求输出：

```json
{
  "research_goal": "理解X的核心机制与当前局限",
  "evaluation_criteria": ["数据时效性（2023年后）", "来源权威性", "跨来源一致性"],
  "search_matrix": {
    "concept":      ["X 的定义与核心机制"],
    "latest":       ["X 2024 最新进展"],
    "evidence":     ["X 实证数据与统计"],
    "controversy":  ["X 的批评与替代方案"]
  }
}
```

四个维度的设计意图：

| 维度 | 目的 | 检索倾向 |
|---|---|---|
| `concept` | 建立概念基线 | 内部 RAG 优先 |
| `latest` | 追踪最新动态 | Web Search 优先，注明年份 |
| `evidence` | 收集实证数据 | 要求引用具体数据/统计 |
| `controversy` | 引入反例和争议 | 专门寻找批评、风险、替代观点 |

#### 6.2.3 `research_one()` 维度感知 + 证据分级

新增 `dimension` 参数，影响提取 prompt 的侧重点：

- `concept`：提取定义、原理、机制
- `latest`：强调时间敏感性，要求注明数据年份
- `evidence`：要求引用具体数量/比例/数据，优先内部来源
- `controversy`：**专门提取反驳、风险点、替代观点**，填入 `counterpoint` 字段

证据分级（纯规则，无 LLM 开销）：

```python
def grade_evidence(citations: list[dict]) -> str:
    n = len(citations)
    has_web = any(c.get("type") == "web" for c in citations)
    has_internal = any(c.get("type") == "internal" for c in citations)
    # 强：多来源 + 内外交叉印证
    if n >= 3 and has_web and has_internal:
        return "strong"
    # 中：至少 2 个来源，或 1 个内部权威来源
    elif n >= 2 or (n >= 1 and has_internal):
        return "medium"
    # 弱：单一来源或仅博客类
    return "weak"
```

#### 6.2.4 `run_deep_research()` 按矩阵执行

```python
# 原来：for question in sub_questions
# 改后：按矩阵维度顺序执行

plan_result = await plan(query, client, model)
search_matrix = plan_result["search_matrix"]

for dimension, queries in search_matrix.items():
    for query in queries:
        yield {"type": "searching", "data": {"query": query, "dimension": dimension, ...}}
        learning = await research_one(query, ..., dimension=dimension)
        yield {"type": "learning", "data": {
            ...,
            "evidence_grade": learning.evidence_grade,
            "dimension": learning.dimension,
            "counterpoint": learning.counterpoint,
        }}
```

`plan` SSE 事件同步扩展，增加 `research_goal` 和检索矩阵信息供前端展示：

```jsonc
{
  "type": "plan",
  "data": {
    "research_goal": "理解X的核心机制与局限",
    "sub_questions": ["..."],          // 扁平化列表，向后兼容
    "search_matrix": { "concept": [...], "latest": [...], ... },
    "evaluation_criteria": ["数据时效性", "来源权威性"]
  }
}
```

#### 6.2.5 `synthesize_report()` 结构化输出

强制固定报告结构，在 prompt 中注入 `evaluation_criteria` 作为撰写约束：

```
## 背景
## 关键发现
  每条标注 [证据：强/中/弱]
## 争议与反例
  汇总所有 controversy 维度的 counterpoint
## 结论与建议
## 可行动清单
```

---

### 6.3 Phase 1：交付卡片（1-2 天）

#### 后端：新 SSE 事件 `deliverable`

在 `done` 事件之后，调用 `generate_deliverable()` 生成交付卡数据：

```jsonc
{
  "type": "deliverable",
  "data": {
    "title": "量子计算现状与挑战深度报告",
    "summary": "（200字执行摘要）量子计算利用量子纠缠原理...",
    "citation_count": 12,
    "next_questions": [],                  // Phase 2 填充
    "evidence_strength": "high",           // 整体强度
    "citation_table": [                    // 可引用结论表
      { "conclusion": "超导量子比特是当前主流技术路线", "grade": "strong", "source": "Nature 2024" },
      { "conclusion": "容错门限仍是主要工程瓶颈", "grade": "medium", "source": "arXiv 2023" }
    ]
  }
}
```

`generate_deliverable()` 通过一次 LLM 调用，基于完整 `full_report` 文本生成标题和摘要。

#### 前端：类型扩展

```typescript
// deep-research-progress.tsx

export interface DrDeliverable {
  title: string
  summary: string
  citationCount: number
  nextQuestions: string[]                          // Phase 2
  evidenceStrength: "low" | "medium" | "high"
  citationTable: Array<{ conclusion: string; grade: string; source: string }>
}

// DrLearning 新增字段
export interface DrLearning {
  // 原有字段...
  evidenceGrade?: "strong" | "medium" | "weak"
  dimension?: "concept" | "latest" | "evidence" | "controversy"
  counterpoint?: string
}

// DrProgress 新增字段
export interface DrProgress {
  // 原有字段...
  researchGoal?: string
  evaluationCriteria?: string[]
  deliverable?: DrDeliverable
}
```

#### 前端：`DeliveryCard` 组件

渲染于 `DeepResearchProgress` 底部，条件：`isDone && deliverable`：

- 标题 + 200 字摘要
- 引用数量角标
- 可展开的"引用结论表"（每行含结论/证据等级/来源）
- "保存为笔记"按钮 → 调用 `saveNote()`，将 Markdown 报告存为新笔记
- 追问区域（Phase 2 预留位置）
- 评分区域（Phase 2 预留位置）
- 证据强度徽标（Phase 3 预留位置）

`LearningCard` 同步更新：左上角显示维度 badge（概念 / 最新动态 / 实证数据 / 争议），右侧显示证据强度色点（强=绿 / 中=黄 / 弱=红）。

---

### 6.4 Phase 2：推荐追问 + 评分反馈（2-3 天）

#### 后端

`generate_deliverable()` 在生成摘要的同时，额外一次 LLM 调用生成 2-3 条追问：

```python
# 基于 full_report，生成：
# {"next_questions": ["如何在实际工程中应用X？", "X 与 Y 相比有哪些优劣？", "..."]}`
```

#### 前端

- `DeliveryCard` 展示追问 chip，点击调用 `onFollowUp(q)` → 直接触发新一轮 `handleDeepResearch`
- `DeliveryCard` 展示 👍 / 👎 评分按钮，点击后高亮并禁用（一次性评分）
- 评分回调调用现有 `submitMessageFeedback(savedMsgId, rating)`
- `savedMsgId` 从 `handleDeepResearch` finally 块 `saveMessage()` 返回值捕获，存入 `deliverableMessageIdRef`

---

### 6.5 Phase 3：证据强度可视化（1-2 天）

Phase 0 已在 `learning` SSE 事件中提供 `evidence_grade`，Phase 1 已在 `LearningCard` 展示色点。

Phase 3 补充 `DeliveryCard` 整体证据强度徽标：

```typescript
const strengthConfig = {
  low:    { label: "证据较少", colorClass: "text-red-400 border-red-400/30 bg-red-500/10" },
  medium: { label: "证据中等", colorClass: "text-amber-400 border-amber-400/30 bg-amber-500/10" },
  high:   { label: "证据充分", colorClass: "text-emerald-400 border-emerald-400/30 bg-emerald-500/10" },
}
```

点击徽标展开 `doneCitations` 来源摘要列表（title / url / type / excerpt），帮助用户快速评估报告的依据质量。

---

### 6.6 增强后的完整 SSE 事件协议

```jsonc
// Phase 0 扩展：plan 事件新增研究目标与矩阵
{ "type": "plan", "data": {
    "research_goal": "理解X的核心机制",
    "sub_questions": ["..."],
    "search_matrix": { "concept": [...], "latest": [...], "evidence": [...], "controversy": [...] },
    "evaluation_criteria": ["数据时效性", "来源权威性"]
}}

// Phase 0 扩展：searching 事件新增维度
{ "type": "searching", "data": { "query": "X 最新进展 2024", "dimension": "latest", "index": 2, "total": 4 }}

// Phase 0 扩展：learning 事件新增证据等级、维度、反例
{ "type": "learning", "data": {
    "question": "X 2024 最新进展",
    "content": "...",
    "citations": [...],
    "evidence_grade": "strong",
    "dimension": "latest",
    "counterpoint": ""
}}

// Phase 0 扩展：learning 来自 controversy 维度
{ "type": "learning", "data": {
    "question": "X 的批评与替代方案",
    "content": "...",
    "evidence_grade": "medium",
    "dimension": "controversy",
    "counterpoint": "部分研究者认为Y方案在低成本场景中更优，因为..."
}}

// 原有事件不变：writing、token、done、error

// Phase 1 新增：deliverable 事件（done 之后推送）
{ "type": "deliverable", "data": {
    "title": "量子计算现状与挑战深度报告",
    "summary": "（200字摘要）...",
    "citation_count": 12,
    "next_questions": ["如何应用到工程实践？", "与经典计算机的边界在哪？"],
    "evidence_strength": "high",
    "citation_table": [
      { "conclusion": "超导量子比特是当前主流技术路线", "grade": "strong", "source": "Nature 2024" }
    ]
}}
```

---

### 6.7 改动文件汇总

| 文件 | 改动内容 |
|---|---|
| `api/app/agents/deep_research.py` | `Learning` 扩展、`plan()` 重写、`research_one()` 维度感知 + 证据分级、`run_deep_research()` 矩阵执行、`synthesize_report()` 结构化 prompt、`generate_deliverable()` |
| `web/src/services/ai-service.ts` | `DeepResearchEvent.type` 新增 `"deliverable"` |
| `web/src/features/chat/deep-research-progress.tsx` | `DrLearning` / `DrProgress` / `DrDeliverable` 类型扩展，`LearningCard` 维度 badge，新增 `DeliveryCard` 组件 |
| `web/src/features/chat/chat-view.tsx` | 处理 `deliverable` / `learning` 新字段，`handleSaveAsNote`，评分/追问回调 |

---

## 7. 参考资料

- [OpenAI Deep Research System Card](https://cdn.openai.com/deep-research-system-card.pdf)
- [How OpenAI's Deep Research Works - PromptLayer Blog](https://blog.promptlayer.com/how-deep-research-works/)
- [dzhng/deep-research - GitHub (18k stars)](https://github.com/dzhng/deep-research)
- [langchain-ai/open_deep_research - GitHub](https://github.com/langchain-ai/open_deep_research)
- [langchain-ai/deep_research_from_scratch - GitHub](https://github.com/langchain-ai/deep_research_from_scratch)
- [Enterprise Deep Research: Steerable Multi-Agent Deep Research - arXiv](https://arxiv.org/html/2510.17797v1)
