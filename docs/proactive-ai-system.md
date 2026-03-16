# AI 主动感知系统设计文档

> 设计日期：2026-03-15  
> 依赖特性：记忆系统 V2（L2-L5）、ReAct Agent、Celery + Redis、TanStack Query  
> 目标：将 AI Agent 从"被动工具"升级为"应用灵魂"——无需用户主动调用，AI 在编辑、浏览、索引等各环节主动提供智能辅助

---

## 一、背景与动机

### 1.1 现状分析

当前 LyraNote 的 AI 功能**全部依赖用户主动触发**：

| 功能 | 触发方式 | 问题 |
|------|----------|------|
| Chat / Copilot | 用户输入并发送消息 | 完全被动，用户不提问则 AI 沉默 |
| Ghost Text | 用户打字后 800ms 自动触发 | 半主动，但仅限续写补全 |
| Polish / Rewrite | 选中文本 + 点击按钮 | 被动 |
| Deep Research | 用户点击按钮 | 被动 |
| Artifact 生成 | 用户在 Studio 面板点击 | 被动 |
| Ask AI | 选中文本 + 点击 "Ask AI" | 被动 |

已有的后台处理（memory extraction、reflection、diary flush）虽然自动运行，但**不产生任何用户可见的输出**。AI 的存在感仅限于用户主动打开 Copilot 面板或进入 Chat 页面时。

### 1.2 核心矛盾

AI 已具备丰富的记忆系统（L2 偏好记忆、L3 事实记忆、L4 场景感知、L5 反思进化）和强大的 ReAct 多步推理能力，但这些能力被锁在"等待用户提问"的被动模式中。与 Notion AI、Obsidian Copilot 等竞品相比，LyraNote 缺乏**让 AI 主动"冒出来"**的机制。

### 1.3 设计理念

"AI 灵魂化"不是让 AI 不断弹窗打扰用户，而是让 AI 在**用户需要的时刻、恰当的位置**主动出现：

- **适时**：源文件索引完成时、用户停顿时、打开笔记本时——而非随机弹出
- **适量**：每次只给 2-3 条精准建议，不做信息轰炸
- **可忽略**：所有主动提示都可以一键关闭，不阻断主流程
- **渐进增强**：从轻量微交互到深层智能，分层实现

---

## 二、实时通信方案选型

### 2.1 现有通信架构

```
┌─────────────┐    SSE Stream     ┌─────────────┐
│   Browser    │◄─────────────────│   FastAPI    │   聊天流式输出
│  (Next.js)   │                  │   Server     │
│              │    REST API      │              │
│              │◄────────────────►│              │   CRUD + AI 端点
│              │                  │              │
│  TanStack    │    Polling (4s)  │              │
│   Query      │─────────────────►│              │   Source 状态检测
└─────────────┘                  └──────┬───────┘
                                        │ enqueue
                                 ┌──────▼───────┐
                                 │ Celery Worker │   Source 索引、笔记摘要
                                 │  (+ Redis)   │
                                 └──────────────┘
```

| 通道 | 技术 | 用途 |
|------|------|------|
| 聊天流式输出 | SSE（`StreamingResponse`） | 对话 token 流、agent steps、citations |
| 源状态更新 | TanStack Query 轮询（4s） | 检测 `source.status` 从 `processing` → `indexed` |
| 通知 | 前端内存 `notify.ts` | 纯客户端 toast，无后端推送能力 |

### 2.2 WebSocket 可行性分析

**不引入 WebSocket**，理由如下：

| 维度 | 分析 |
|------|------|
| 架构复杂度 | WSS 需要连接管理、心跳保活、断线重连、Redis Pub/Sub 中间层（Celery worker 无法直接推到 WS），投入产出比低 |
| 用户场景 | LyraNote 是单用户应用，无多用户实时协作需求，WSS 的双向低延迟优势无法发挥 |
| 延迟容忍度 | 4 秒轮询检测 source 状态变化完全可接受——索引本身需要 10-60 秒 |
| 已有覆盖 | SSE 已覆盖延迟最敏感的场景（聊天流式输出），体验良好 |
| 部署复杂度 | WebSocket 需要反向代理（Nginx/Caddy）额外配置 |

### 2.3 选定方案：增强轮询 + REST

| 主动功能 | 实现方案 |
|----------|----------|
| 源索引完成通知 | 前端 TanStack Query 轮询（已有），增加 `useRef` diff 检测，状态变化时调 REST API 获取推荐问题 |
| 上下文问候 | `GET /api/v1/notebooks/{id}/context-greeting`，前端打开笔记本时请求一次 |
| 写作伴侣 | `POST /api/v1/ai/writing-context`，前端编辑器内容变化时 30s 防抖调用 |
| Insight 推送 | 后端将 insight 写入 DB，前端打开首页 / Copilot 时拉取 |

**演进路径**：如果未来需要真正的服务端推送（如多用户协作），可先加轻量 SSE Event Bus（单条 `/api/v1/events/stream` 长连接推送所有事件），再考虑 WebSocket。

---

## 三、整体架构：三层渗透模型

```
┌──────────────────────────────────────────────────────────────────┐
│                    AI 主动感知系统                                 │
├────────────────────┬─────────────────────┬───────────────────────┤
│  Layer 1           │  Layer 2            │  Layer 3              │
│  微交互渗透         │  上下文智能           │  自主行动              │
│                    │                     │                       │
│  ① 源索引完成反馈    │  ④ 写作伴侣          │  ⑥ 定时任务系统        │
│  ② 智能上下文问候    │  ⑤ 笔记索引到知识库   │  ⑦ 跨笔记本知识关联    │
│  ③ 编辑器 AI 微提示  │                     │  ⑧ Insight 推送       │
├────────────────────┴─────────────────────┴───────────────────────┤
│  基础设施：ProactiveStore (Zustand) + REST API + Celery Worker   │
└──────────────────────────────────────────────────────────────────┘
```

**依赖关系**：

- ① ② ③ 可独立实现，互不依赖
- ④ 依赖 ⑤（笔记索引到知识库后写作伴侣才有内容可推荐）
- ⑦ 依赖 ⑤（跨笔记本关联需要笔记内容被索引）
- ⑥ ⑧ 独立于其他模块

---

## 四、前端基础设施

### 4.1 ProactiveStore — 主动建议状态管理

新增 Zustand store，作为所有主动 AI 功能的前端状态中心。

**文件**：`web/src/store/use-proactive-store.ts`

```typescript
type ProactiveSuggestion = {
  id: string;
  type: "source_indexed" | "context_greeting" | "insight";
  title: string;
  content: string;
  questions?: string[];
  sourceId?: string;
  timestamp: number;
  read: boolean;
};

type ProactiveStore = {
  suggestions: ProactiveSuggestion[];
  unreadCount: number;
  addSuggestion: (s: Omit<ProactiveSuggestion, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
};
```

**设计要点**：

- `unreadCount` 派生自 `suggestions.filter(s => !s.read).length`
- `FloatingOrb` 订阅 `unreadCount > 0` 时显示小红点
- `CopilotPanel` 订阅 `suggestions`，在消息列表上方渲染主动建议卡片
- 建议列表上限 10 条，超出时丢弃最旧的已读建议

---

## 五、功能详细设计

### 5.1 源文件索引完成时的 AI 主动反馈

#### 5.1.1 用户价值

用户上传 PDF 后等待索引完成，当前只看到状态图标从"处理中"变为"已完成"，需要自己想该问什么。改造后，AI 主动告知"这份资料讲了什么，你可能想问这些问题"，让用户立刻进入研究状态。

#### 5.1.2 数据流

```
SourcesPanel (轮询 4s)
    │ useRef prevSources diff → 发现 source.status: processing → indexed
    │
    ▼
ProactiveStore.addSuggestion({ type: "source_indexed", sourceId })
    │
    │ 同时触发
    ▼
GET /api/v1/sources/{sourceId}/suggestions
    │ 后端读取 source.summary + 前 3 个 chunks
    │ LLM 生成 2-3 个推荐问题
    │
    ▼
ProactiveStore 更新 suggestion.questions
    │
    ▼
CopilotPanel 渲染 ProactiveCard
    │ 用户点击问题 → 自动发送到 Copilot 对话
    │ 用户关闭卡片 → markRead
```

#### 5.1.3 后端端点

**`GET /api/v1/sources/{source_id}/suggestions`**

文件：`api/app/domains/source/router.py`（在现有 source router 中新增）

```python
@router.get("/sources/{source_id}/suggestions")
async def get_source_suggestions(
    source_id: UUID,
    user: CurrentUser,
    db: DbDep,
):
    source = await db.get(Source, source_id)
    if not source or source.status != "indexed":
        raise AppError("source_not_ready", 400)

    # 如果已有缓存的推荐问题，直接返回
    if source.metadata_ and source.metadata_.get("suggestions"):
        return {"summary": source.summary, "questions": source.metadata_["suggestions"]}

    # 取前 3 个 chunks 作为上下文
    chunks = await db.execute(
        select(Chunk.content)
        .where(Chunk.source_id == source_id)
        .order_by(Chunk.chunk_index)
        .limit(3)
    )
    context = "\n".join(row[0][:500] for row in chunks.all())

    # LLM 生成推荐问题
    questions = await _generate_source_questions(source.title, source.summary, context)

    # 缓存到 source.metadata_
    meta = source.metadata_ or {}
    meta["suggestions"] = questions
    source.metadata_ = meta
    await db.commit()

    return {"summary": source.summary, "questions": questions}
```

LLM Prompt：

```
你是一个研究助手。用户刚导入了一份名为「{title}」的资料。

资料摘要：{summary}

资料内容片段：{context}

请生成 2-3 个该用户可能想深入探索的问题。
要求：
- 返回纯 JSON 数组，格式：["问题1", "问题2", "问题3"]
- 每个问题不超过 25 个汉字
- 问题要具体、有针对性，直接与资料内容相关
- 优先生成能帮助用户理解资料核心观点的问题
```

#### 5.1.4 前端检测层

文件：`web/src/features/source/sources-panel.tsx`

在现有 `useQuery` 的基础上增加 diff 检测：

```typescript
const prevSourcesRef = useRef<Source[]>([]);

const { data: sources = [], isLoading } = useQuery({
  queryKey: ["sources", notebookId],
  queryFn: () => getSources(notebookId),
  refetchInterval: (query) => {
    const list = query.state.data ?? [];
    return list.some((s) => s.status === "processing" || s.status === "pending")
      ? 4000
      : false;
  },
});

// Diff 检测：source 从 processing → indexed
useEffect(() => {
  const prev = prevSourcesRef.current;
  if (prev.length === 0) {
    prevSourcesRef.current = sources;
    return;
  }

  for (const source of sources) {
    const prevSource = prev.find((p) => p.id === source.id);
    if (prevSource && prevSource.status === "processing" && source.status === "indexed") {
      // 触发主动建议
      useProactiveStore.getState().addSuggestion({
        type: "source_indexed",
        title: source.title ?? "新资料",
        content: source.summary ?? "资料已准备就绪",
        sourceId: source.id,
      });
    }
  }

  prevSourcesRef.current = sources;
}, [sources]);
```

#### 5.1.5 前端展示层 — ProactiveCard

文件：`web/src/features/copilot/proactive-card.tsx`

设计为一个紧凑的卡片组件，嵌入 CopilotPanel 消息列表上方：

```
┌─────────────────────────────────────────┐
│ ✨ 资料「论文A」已准备就绪           [×] │
│                                         │
│ 摘要：本文探讨了大语言模型在...          │
│                                         │
│ 💡 你可能想问：                          │
│  ┌─────────────────────────────────┐    │
│  │ 这篇论文的核心创新点是什么？      │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 实验结果相比基线提升了多少？      │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

- 点击问题按钮 → 将问题文本注入 CopilotPanel 的输入框并自动发送
- 点击 × → `dismiss(id)` + `markRead(id)`
- 卡片在 3 分钟后自动标记为 read（不再置顶）

---

### 5.2 智能上下文问候

#### 5.2.1 用户价值

替换 Copilot 面板中硬编码的 3 条 suggested prompts（`copilot-panel.tsx` 第 19-35 行），基于用户当前笔记本状态生成个性化建议，让用户一打开笔记本就知道"下一步该做什么"。

#### 5.2.2 场景识别逻辑

```
打开笔记本
    │
    ▼
GET /api/v1/notebooks/{id}/context-greeting
    │
    ├─ source_count == 0 && note 为空
    │   → "这是个新笔记本，先添加一些研究资料吧！"
    │   → 建议：["上传PDF导入资料", "从网页导入资料"]
    │
    ├─ source_count > 0 && note 为空
    │   → "你已导入 N 份资料，要我帮你梳理核心要点？"
    │   → 建议：基于 sources 的问题
    │
    ├─ note 有内容 && 最近有对话
    │   → 基于笔记内容 + 最近对话，LLM 生成个性化建议
    │
    └─ updated_at > 7 天前
        → "好久没看这个笔记本了，需要回顾一下吗？"
        → 建议：["总结笔记本内容", "查看最新相关研究"]
```

#### 5.2.3 后端端点

**`GET /api/v1/notebooks/{notebook_id}/context-greeting`**

文件：`api/app/domains/ai/router.py`

```python
# 模块级缓存：notebook_id → (greeting, fingerprint, timestamp)
_greeting_cache: dict[str, tuple[dict, str, datetime]] = {}
GREETING_CACHE_TTL = 3600  # 1 小时

@router.get("/notebooks/{notebook_id}/context-greeting")
async def get_context_greeting(
    notebook_id: UUID,
    user: CurrentUser,
    db: DbDep,
):
    # 收集上下文
    notebook = await db.get(Notebook, notebook_id)
    source_count = await _count_sources(db, notebook_id)
    note = await _get_latest_note(db, notebook_id)
    note_excerpt = (note.content_text or "")[:500] if note else ""
    summary = notebook.summary if hasattr(notebook, "summary") else None

    # 计算内容指纹用于缓存
    fingerprint = hashlib.md5(
        f"{source_count}:{len(note_excerpt)}:{summary or ''}".encode()
    ).hexdigest()

    # 检查缓存
    cache_key = str(notebook_id)
    if cache_key in _greeting_cache:
        cached, cached_fp, cached_at = _greeting_cache[cache_key]
        if cached_fp == fingerprint and (datetime.utcnow() - cached_at).seconds < GREETING_CACHE_TTL:
            return cached

    # 场景判断（不调 LLM 的快速路径）
    if source_count == 0 and not note_excerpt:
        result = {
            "greeting": "这是个新笔记本，先添加一些研究资料吧！",
            "suggestions": [
                {"label": "上传 PDF 资料", "action": "import"},
                {"label": "从网页导入", "action": "import_url"},
            ],
        }
    elif source_count > 0 and not note_excerpt:
        result = {
            "greeting": f"你已导入 {source_count} 份资料，要我帮你梳理核心要点开始写作吗？",
            "suggestions": await _generate_suggestions(db, notebook_id, summary),
        }
    else:
        # 有笔记内容，调 LLM 生成个性化建议
        result = await _generate_personalized_greeting(
            source_count, note_excerpt, summary, notebook.updated_at
        )

    _greeting_cache[cache_key] = (result, fingerprint, datetime.utcnow())
    return result
```

`_generate_suggestions` 和 `_generate_personalized_greeting` 内部调用 LLM，返回格式：

```json
{
  "greeting": "你正在研究 Transformer 架构，上次写到了注意力机制的优化方向...",
  "suggestions": [
    { "label": "这几份论文的核心创新点对比", "prompt": "对比所有来源中的核心创新点" },
    { "label": "注意力机制还有哪些优化方向", "prompt": "基于已有资料，分析注意力机制的优化方向" },
    { "label": "帮我扩展当前段落", "prompt": "根据知识库内容，帮我扩展当前笔记中的最后一段" }
  ]
}
```

#### 5.2.4 前端改造

文件：`web/src/features/copilot/copilot-panel.tsx`

```typescript
// 替换硬编码的 suggestedPrompts
const { data: greeting, isLoading: greetingLoading } = useQuery({
  queryKey: ["context-greeting", notebookId],
  queryFn: () => getContextGreeting(notebookId!),
  enabled: !!notebookId && messages.length === 0,
  staleTime: 1000 * 60 * 30, // 30 分钟客户端缓存
});

// 渲染：
// - greetingLoading → 3 个 skeleton 按钮
// - greeting → 显示 greeting.greeting + greeting.suggestions 按钮
// - 异常 → fallback 到默认 suggestedPrompts
```

---

### 5.3 编辑器 AI 微提示（Nudge System）

#### 5.3.1 用户价值

用户在编辑器中写作停顿时（45 秒无输入），AI 轻量浮现一个气泡提示，提供"继续写作"或"搜索相关资料"的快捷入口，降低从停顿到恢复写作的认知负担。

#### 5.3.2 设计约束

- **克制原则**：每个编辑会话最多显示 **3 次**
- **不阻断**：用户任意按键或点击页面即消失
- **条件触发**：编辑器内容 > 100 字且光标在文档末尾 1/3 区域时才触发
- **纯前端**：不调后端 API，零延迟

#### 5.3.3 实现方案

文件：`web/src/features/editor/note-editor.tsx`

```typescript
const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const nudgeCountRef = useRef(0);
const [showNudge, setShowNudge] = useState(false);

// 在 editor.on("update", handleUpdate) 中：
// 1. 每次输入重置 idle timer
// 2. 重置时关闭已有的 nudge
clearTimeout(idleTimerRef.current);
setShowNudge(false);

idleTimerRef.current = setTimeout(() => {
  const docLength = editor.state.doc.textContent.length;
  const cursorPos = editor.state.selection.from;

  if (docLength > 100 && cursorPos > docLength * 0.66 && nudgeCountRef.current < 3) {
    setShowNudge(true);
    nudgeCountRef.current += 1;
  }
}, 45_000);
```

气泡 UI：

```
                          ┌────────────────────────────────┐
                          │ ✨ 需要我帮你继续吗？            │
                          │                                │
                          │  [继续写作]  [搜索相关资料]      │
                          └────────────────────────────────┘
                                        ▲
                                        │ (光标位置附近)
```

- [继续写作] → 手动触发 Ghost Text 请求（复用 `getInlineSuggestion`）
- [搜索相关资料] → 取光标前 200 字 → `setPendingPrompt({ text: "基于我正在写的内容，搜索知识库中的相关资料：..." })`，打开 Copilot 面板

---

### 5.4 写作伴侣 — 相关资料推荐

#### 5.4.1 用户价值

用户在编辑器中写作时，Copilot 面板自动根据用户正在写的内容推荐知识库中的相关片段。不需要用户思考"该搜什么"——AI 自动将最相关的资料浮现出来。

#### 5.4.2 数据流

```
NoteEditor (onUpdate)
    │ 30s 防抖 + 内容变化 > 50字
    │
    ▼
POST /api/v1/ai/writing-context
    │ { notebook_id, text_around_cursor: "...光标前后 500 字..." }
    │
    ▼
后端 embedding → pgvector cosine search → top-3 chunks
    │ (纯向量检索，不调 LLM，延迟 < 500ms)
    │
    ▼
返回 { chunks: [{ source_title, excerpt, score, chunk_id }] }
    │
    ▼
CopilotPanel → WritingContextBar 组件
    │ 可折叠的"相关资料"区域
    │ [插入引用] → 将 excerpt 插入编辑器
    │ [提问] → 将 excerpt 作为引用发送到 Copilot 对话
```

#### 5.4.3 后端端点

**`POST /api/v1/ai/writing-context`**

文件：`api/app/domains/ai/router.py`

```python
class WritingContextRequest(BaseModel):
    notebook_id: str
    text_around_cursor: str = Field(max_length=600)

@router.post("/ai/writing-context")
async def get_writing_context(
    body: WritingContextRequest,
    user: CurrentUser,
    db: DbDep,
):
    from app.providers.embedding import embed_query
    from app.agents.retrieval import _vector_search

    query_vec = await embed_query(body.text_around_cursor[:500])
    results = await _vector_search(
        query_vec=query_vec,
        notebook_id=body.notebook_id,
        db=db,
        top_k=3,
        global_search=False,
        user_id=None,
    )

    # 过滤低分结果
    filtered = [r for r in results if r["vector_score"] >= 0.35]

    return {
        "chunks": [
            {
                "source_title": r["source_title"],
                "excerpt": r["excerpt"],
                "score": round(r["vector_score"], 3),
                "chunk_id": r["chunk_id"],
            }
            for r in filtered[:3]
        ]
    }
```

#### 5.4.4 前端组件

文件：`web/src/features/copilot/writing-context-bar.tsx`

嵌入 `CopilotPanel` 消息列表上方，可折叠：

```
┌───────────────────────────────────────────┐
│  📚 相关资料 (基于你正在写的内容)       ▾  │
├───────────────────────────────────────────┤
│  📄 来源A · 相关度 87%                    │
│    "...相关文本片段预览..."               │
│    [插入引用]  [提问]                     │
│                                           │
│  📄 来源B · 相关度 72%                    │
│    "...相关文本片段预览..."               │
│    [插入引用]  [提问]                     │
└───────────────────────────────────────────┘
```

---

### 5.5 笔记索引到知识库（Note-as-Source）

#### 5.5.1 用户价值

当前只有导入的源文件（PDF/URL/MD）会被索引，用户自己写的笔记内容不在知识库中。这意味着：
- 用户在 A 笔记本中写的研究总结，在 B 笔记本的对话中无法被 AI 引用
- 全局 Chat 无法搜索到用户自己的笔记内容
- 知识是单向的（源→AI），用户的思考成果无法反哺 AI

#### 5.5.2 数据模型扩展

**Chunk 表新增字段**：

```python
class Chunk(Base):
    __tablename__ = "chunks"

    # ... 现有字段 ...

    # 新增：区分 chunk 来源类型
    source_type: Mapped[str] = mapped_column(
        String(20), default="source", nullable=False
    )
    # "source" — 来自导入的 Source（PDF/URL/MD）
    # "note"   — 来自用户笔记

    # 新增：笔记来源的 note_id（source_type="note" 时非空）
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), nullable=True
    )
```

**Note 表新增字段**：

```python
class Note(Base):
    __tablename__ = "notes"

    # ... 现有字段 ...

    # 新增：上次索引时的内容哈希，用于防抖
    last_indexed_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)
```

**Alembic 迁移**：新建 `api/alembic/versions/xxx_note_indexing.py`

#### 5.5.3 Celery 任务

文件：`api/app/workers/tasks.py`

```python
@celery_app.task(name="index_note")
def index_note(note_id: str):
    """
    将笔记内容索引到 chunks 表。
    防抖：仅当 content_text 的 MD5 与 last_indexed_hash 不同时才执行。
    """
    async def _run():
        from hashlib import md5
        from app.models import Note, Chunk
        from app.agents.ingestion import chunk_text
        from app.providers.embedding import embed_texts

        async with _task_db() as db:
            note = await db.get(Note, UUID(note_id))
            if not note or not note.content_text:
                return

            content_hash = md5(note.content_text.encode()).hexdigest()
            if note.last_indexed_hash == content_hash:
                return  # 内容未变化，跳过

            # 分块（笔记内容较短，用 256 token chunk）
            texts = chunk_text(note.content_text, chunk_size=256, chunk_overlap=32)
            if not texts:
                return

            # 嵌入
            embeddings = await embed_texts(texts)

            # 删除旧的笔记 chunks
            await db.execute(
                delete(Chunk).where(
                    Chunk.source_type == "note",
                    Chunk.note_id == note.id,
                )
            )

            # 写入新 chunks
            for i, (text, emb) in enumerate(zip(texts, embeddings)):
                db.add(Chunk(
                    source_id=None,  # 笔记 chunk 无 source_id
                    notebook_id=note.notebook_id,
                    content=text,
                    chunk_index=i,
                    embedding=emb,
                    source_type="note",
                    note_id=note.id,
                ))

            note.last_indexed_hash = content_hash
            await db.commit()

    _run_async(_run())
```

**注意**：`Chunk.source_id` 当前是 `NOT NULL` 外键，需要在迁移中改为 `nullable=True`（仅 `source_type="note"` 时为空）。或者，为笔记创建一个虚拟的 Source 记录（`type="note"`），这样不改 Chunk 表结构。推荐后者——对现有检索代码的侵入最小：

```python
# 在 index_note 中：为笔记创建/更新对应的虚拟 Source
source = await _get_or_create_note_source(db, note)
# chunk 的 source_id 指向这个虚拟 Source
```

#### 5.5.4 触发时机

文件：`api/app/domains/note/router.py`

```python
@router.patch("/notes/{note_id}")
async def update_note(note_id: UUID, body: NoteUpdate, user: CurrentUser, db: DbDep):
    # ... 现有更新逻辑 ...

    # 如果 content_text 发生变化且长度 > 100 字，触发异步索引
    if body.content_text and len(body.content_text) > 100:
        content_hash = hashlib.md5(body.content_text.encode()).hexdigest()
        if content_hash != note.last_indexed_hash:
            from app.workers.tasks import index_note
            index_note.delay(str(note_id))

    return note
```

#### 5.5.5 Retrieval 适配

`api/app/agents/retrieval.py` 的 `_vector_search` 当前通过 `Chunk.source_id → Source.status == "indexed"` 过滤。对于 `source_type="note"` 的 chunks：

- 如果采用"虚拟 Source"方案，虚拟 Source 的 `status` 设为 `"indexed"`，无需改检索代码
- 如果采用 `source_id=None` 方案，需要修改 JOIN 条件为 `LEFT JOIN` 或拆分查询

推荐"虚拟 Source"方案，对检索代码零侵入。

---

## 六、实施路线图

### Phase 1：微交互渗透（2 天）

- [ ] `ProactiveStore` Zustand store
- [ ] `ProactiveCard` 组件
- [ ] `GET /sources/{id}/suggestions` 端点
- [ ] `sources-panel.tsx` diff 检测 + ProactiveStore 集成
- [ ] `CopilotPanel` 集成 ProactiveStore 展示
- [ ] `FloatingOrb` 小红点
- [ ] `GET /notebooks/{id}/context-greeting` 端点
- [ ] `CopilotPanel` 动态 suggestedPrompts 替换

### Phase 2：上下文智能（3-4 天）

- [ ] Alembic 迁移：`Chunk.source_type`、`Note.last_indexed_hash`
- [ ] `index_note` Celery 任务
- [ ] `PATCH /notes/{id}` 触发 `index_note.delay()`
- [ ] `POST /ai/writing-context` 端点
- [ ] `WritingContextBar` 前端组件
- [ ] `NoteEditor` 写作上下文防抖发送

### Phase 3：编辑器微提示（0.5-1 天）

- [ ] `note-editor.tsx` idle 检测 + Nudge 气泡
- [ ] Nudge 计数器和条件逻辑

### Phase 4：定时任务系统（5-7 天）

- [ ] 按 `docs/scheduled-tasks.md` 实现完整管道

---

## 七、文件改动清单

### 新建文件

| 文件路径 | 说明 |
|----------|------|
| `web/src/store/use-proactive-store.ts` | 主动建议状态管理 |
| `web/src/features/copilot/proactive-card.tsx` | AI 主动洞察卡片组件 |
| `web/src/features/copilot/writing-context-bar.tsx` | 写作伴侣相关资料卡片 |
| `api/alembic/versions/xxx_note_indexing.py` | 数据库迁移（Chunk + Note 新字段） |

### 修改文件

| 文件路径 | 改动内容 |
|----------|----------|
| `api/app/models.py` | `Chunk` 新增 `source_type` / `note_id`；`Note` 新增 `last_indexed_hash` |
| `api/app/domains/source/router.py` | 新增 `GET /sources/{id}/suggestions` |
| `api/app/domains/ai/router.py` | 新增 `GET /notebooks/{id}/context-greeting`、`POST /ai/writing-context` |
| `api/app/domains/note/router.py` | 笔记更新后触发 `index_note.delay()` |
| `api/app/workers/tasks.py` | 新增 `index_note` Celery 任务 |
| `web/src/features/copilot/copilot-panel.tsx` | 动态 suggestedPrompts；集成 ProactiveStore；集成 WritingContextBar |
| `web/src/features/copilot/floating-orb.tsx` | 有未读建议时显示小红点 |
| `web/src/features/source/sources-panel.tsx` | `useRef` diff 检测状态变化，触发 proactive suggestion |
| `web/src/features/editor/note-editor.tsx` | idle 检测 + AI 微提示气泡 |
| `web/src/services/ai-service.ts` | 新增 `getSourceSuggestions()`、`getContextGreeting()`、`getWritingContext()` |
| `web/messages/zh.json` / `en.json` | 新增主动 AI 相关 i18n 文案 |

---

## 八、毕设论文价值点

1. **从被动到主动**：系统性地将 AI 从"被问才答"升级为"主动感知 + 适时建议"，体现 AI Agent 设计思想的演进
2. **三层渗透架构**：提出"微交互渗透 → 上下文智能 → 自主行动"的渐进式 AI 融合框架，可作为论文的方法论贡献
3. **技术选型权衡**：WSS vs SSE vs 增强轮询的详细对比分析，体现工程决策能力
4. **知识闭环**：Note-as-Source 打通"源→AI→笔记→知识库"的完整闭环，解决现有系统中知识单向流动的问题
5. **克制设计**：在主动 AI 与用户体验之间寻找平衡——频率控制、可忽略、渐进增强，避免过度打扰
6. **与竞品对比**：Notion AI（纯被动）、Obsidian Copilot（插件式）、Google NotebookLM（半主动）均未实现完整的 AI 主动感知体系
