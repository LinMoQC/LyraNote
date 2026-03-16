# 动态推荐问题方案

## 背景

当前 Chat 页面欢迎屏上的 4 个推荐问题是硬编码的静态文本，与用户的实际知识库内容毫无关联。本方案将其替换为**由后端 LLM 动态生成**的个性化推荐，结合用户的知识库来源和历史对话主题，让推荐问题真正有价值。

---

## 整体架构

```
前端 useQuery("chat-suggestions")
        │
        ▼
GET /api/v1/ai/suggestions
        │
        ├─ 检查服务器内存缓存
        │   ├─ 命中（6小时内 & 来源数量未变）→ 直接返回缓存结果
        │   └─ 未命中 →
        │           ├─ 查询全局 Notebook 下的 Sources（取前8条标题/摘要）
        │           ├─ 查询最近5条对话标题
        │           ├─ 调用 gpt-4o-mini 生成4个推荐问题
        │           ├─ 写入服务器内存缓存（含时间戳 + 来源数快照）
        │           └─ 返回结果
```

---

## 一、后端实现

### 文件：`api/app/domains/ai/router.py`

#### 缓存策略

使用 **模块级 Python 字典** 作为服务器内存缓存，无需数据库迁移：

```python
# user_id → (suggestions列表, 生成时间, 来源数快照)
_suggestions_cache: dict[str, tuple[list[str], datetime, int]] = {}
CACHE_TTL_HOURS = 6
```

**缓存失效条件（满足任一即重新生成）：**
- 距上次生成超过 6 小时
- 知识库中的 source 数量发生变化（新增或删除了资料）

#### 端点逻辑

```
GET /api/v1/ai/suggestions

1. 获取当前用户的全局 Notebook
2. 统计该 Notebook 下已索引的 source 数量
3. 检查内存缓存 → 命中则直接返回
4. 未命中：
   a. 查询前 8 条 source 的标题和摘要
   b. 查询最近 5 条 conversation 的标题
   c. 组装 prompt，调用 gpt-4o-mini
   d. 解析返回的 JSON 数组（4个问题字符串）
   e. 写入缓存
5. 返回 {"suggestions": ["...", "...", "...", "..."]}
```

#### LLM Prompt 设计

```
你是一个知识发现助手。
用户的知识库包含以下内容：
- {来源标题列表及摘要}

用户最近讨论过的话题：
- {对话标题列表}

请基于以上内容，生成4个该用户可能想深入探索的问题。
要求：
- 返回纯 JSON 数组，格式：["问题1", "问题2", "问题3", "问题4"]
- 每个问题不超过 20 个汉字
- 问题要具体、有针对性，体现知识库的实际内容
- 不要泛泛而谈
```

---

## 二、前端实现

### 文件：`web/src/services/ai-service.ts`

新增一个获取推荐问题的函数：

```typescript
export async function getSuggestions(): Promise<string[]> {
  const res = await apiClient.get<{ suggestions: string[] }>("/ai/suggestions")
  return res.data.suggestions
}
```

---

### 文件：`web/src/features/chat/chat-view.tsx`

#### 数据获取

用 `useQuery` 替换静态常量 `SUGGESTED_PROMPTS`：

```typescript
const { data: dynamicSuggestions, isLoading: suggestionsLoading } = useQuery({
  queryKey: ["chat-suggestions"],
  queryFn: getSuggestions,
  staleTime: 1000 * 60 * 30,  // 客户端侧缓存 30 分钟
})
```

#### UI 状态处理

| 状态 | 显示内容 |
|------|---------|
| 加载中 | 4 个 `animate-pulse` 骨架按钮 |
| 加载成功 | 后端返回的动态问题，图标统一用 `Sparkles` |
| 加载失败 / 数据为空 | 回退到原有静态 `SUGGESTED_PROMPTS` 数组 |

---

## 三、刷新时机

| 触发条件 | 行为 |
|---------|------|
| 进入 chat 页面 | 如客户端缓存未过期（30分钟内），直接使用缓存数据 |
| 客户端缓存过期 | 重新请求后端；后端如服务器缓存未过期则秒返回 |
| 上传新资料（source count 变化） | 下次请求时后端检测到来源数变化，重新调用 LLM 生成 |
| 服务器缓存超过 6 小时 | 下次请求时自动重新生成 |

---

## 四、实施步骤

1. **后端**：在 `api/app/domains/ai/router.py` 新增 `GET /ai/suggestions` 路由，实现缓存逻辑和 LLM 调用
2. **前端 Service**：在 `web/src/services/ai-service.ts` 新增 `getSuggestions()` 函数
3. **前端 UI**：修改 `web/src/features/chat/chat-view.tsx`，用 `useQuery` + 骨架屏 + 降级回退替换静态数组

---

## 五、优势总结

- **无需数据库迁移**：缓存完全在服务器内存中，简单可靠
- **性能友好**：LLM 调用仅在缓存失效时触发，多数情况下瞬间返回
- **内容相关性**：推荐问题与用户实际上传的资料和历史对话直接关联
- **优雅降级**：后端异常时自动回退静态推荐，不影响核心功能
