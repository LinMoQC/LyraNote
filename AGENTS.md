# AGENTS.md — LyraNote Agent Guide

> 这是 AI Agent 进入 LyraNote 代码库的唯一入口。保持简短，详细内容在 docs/ 下。

## 这是什么项目

LyraNote：AI 驱动的研究笔记应用。用户导入 PDF / 网页 / Markdown 作为知识来源，
AI 基于私有知识库进行 RAG 对话、内联写作辅助、结构化产出物生成。

## 技术栈速览

- **Frontend**: Next.js 15 App Router, React 19, TypeScript, Tailwind, Tiptap v2, TanStack Query v5, Zustand
- **Backend**: FastAPI (Python 3.12), SQLAlchemy async, PostgreSQL 16 + pgvector, Celery + Redis, LangGraph
- **Monorepo**: pnpm + Turborepo — `apps/web`, `apps/api`, `packages/{api-client,types,cli}`

## 代码导航

| 想了解什么               | 去哪里                              |
| -------------------- | -------------------------------- |
| 架构分层 & 边界规则          | `docs/ARCHITECTURE.md`           |
| 后端开发规范 (FastAPI/Python) | `docs/BACKEND.md`                |
| 前端开发规范 (Next.js/React) | `docs/FRONTEND.md`               |
| 代码质量 & 测试标准          | `docs/QUALITY.md`                |
| 当前活跃执行计划             | `docs/exec-plans/active/`        |
| 已知技术债务               | `docs/exec-plans/tech-debt-tracker.md` |
| 功能设计文档               | `docs/design-docs/index.md`      |
| 本地启动 & 运维             | `README.md`                      |

---

## Agent 工作流协议（必须遵守）

每次实现新功能或修复，**必须按以下 5 步执行，不得跳过**：

### Step 1 — 创建执行计划（先规划，再动手）

在 `docs/exec-plans/active/` 创建 `<feature-name>.md`，
使用模板 `docs/exec-plans/TEMPLATE.md`。
计划必须包含：目标、任务分解、测试策略、验收标准。

### Step 2 — 实现代码

按执行计划和架构约束写代码。遵守 `docs/ARCHITECTURE.md` 的分层规则。

### Step 3 — 编写测试（与功能代码同 PR）

- **后端**：在 `apps/api/tests/` 对应子目录写 pytest 测试
- **前端**：在功能文件同目录写 `*.test.tsx`
- 新功能必须有测试；bug fix 必须有回归测试

### Step 4 — 自跑测试，修到全绿

```bash
# 后端单元测试（快速，无 DB，优先跑）
cd apps/api && pytest tests/unit/ -v

# 后端全量测试（需要 Postgres + Redis）
cd apps/api && pytest tests/ -v --tb=short

# 后端覆盖率
cd apps/api && pytest tests/ --cov=app --cov-report=term-missing

# 前端测试
cd apps/web && pnpm test

# 前端监听模式（开发时）
cd apps/web && pnpm test:watch
```

修复所有失败。**不得跳过测试，不得注释掉断言来让测试通过。**

### Step 5 — 提交 PR

只有测试全绿才允许开 PR。PR 描述中附：修改内容摘要 + 测试覆盖说明。
完成后将执行计划移动到 `docs/exec-plans/completed/`。

---

## 强制架构约束（违反 → CI 报错）

### 后端分层

```
domains/<area>/router.py   ← HTTP 层：校验参数、返回 ApiResponse
        ↓
services/<area>_service.py ← 业务逻辑层
        ↓
models.py                  ← SQLAlchemy ORM
        ↓
providers/                 ← 外部 API（LLM、存储、搜索）
```

- `domains/` router 只做 HTTP 层，**禁止**直接执行 DB 查询
- LLM / 外部 API 调用**必须**经过 `providers/`，禁止在 `domains/` 直接 `import openai`
- 返回统一信封：`from app.schemas.response import success, fail`

### 前端分层

```
app/ (routes)       ← 页面入口，尽量薄
    ↓
features/ (业务)    ← 核心业务逻辑、自定义 hooks、本地状态
    ↓
components/ (UI)    ← 纯展示组件，无副作用
    ↓
services/ (API)     ← 所有 HTTP 调用，使用 lib/axios.ts
```

- `features/` **禁止**直接 `fetch` 或调用 `axios`，必须调用 `services/` 层
- `components/ui/` 只放无状态的 Shadcn/Radix 原子组件
- **禁止**在前端 import `openai` 或任何 AI SDK

---

## 本地开发

```bash
./lyra local          # 启动全栈（前端 + 后端 + Docker 服务）
./lyra status         # 查看服务状态
./lyra logs           # 查看日志
```

- 后端日志：`apps/api/logs/$(date +%Y-%m-%d).log`
- API 健康检查：`GET http://localhost:8000/health`
- 前端地址：`http://localhost:3000`

---

## 绝对禁止

- 在 `domains/` router 中直接查 DB（必须有 service 层）
- 在 `features/` 中直接调用 HTTP（必须用 `services/` 层）
- 硬编码 API URL（使用 `lib/axios.ts` 封装）
- 在 `providers/` 以外调用 `openai` SDK
- 跳过测试直接开 PR
- 在代码注释里记录重要决策（写到 `docs/exec-plans/` 里）
