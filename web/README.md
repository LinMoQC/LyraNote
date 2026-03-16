# LyraNote Web

LyraNote 前端应用，基于 **Next.js 15 (App Router)** 构建，提供富文本笔记编辑、AI 对话助手、知识图谱可视化等核心交互界面。

---

## 技术栈

| 技术 | 说明 |
|---|---|
| **Next.js 15 (App Router)** | React 全栈框架 |
| **React 19** | UI 库 |
| **TypeScript** | 类型安全 |
| **Tailwind CSS** | 原子化 CSS 样式 |
| **Tiptap** | 富文本编辑器（ProseMirror 封装） |
| **TanStack Query** | 服务端状态管理与数据缓存 |
| **Zustand** | 客户端全局状态管理 |
| **Framer Motion** | 动画效果 |
| **react-force-graph-2d** | 知识图谱力导向可视化 |
| **markmap** | 思维导图渲染 |
| **next-intl** | 国际化（i18n） |
| **react-hook-form + zod** | 表单验证 |
| **pnpm** | 包管理器 |

---

## 项目结构

```
web/
├── src/
│   ├── app/                  # Next.js App Router 页面
│   │   ├── (auth)/           # 认证相关页面（登录）
│   │   ├── (marketing)/      # 营销页面（落地页、公开笔记本）
│   │   ├── (workspace)/      # 主工作区（需登录）
│   │   │   └── app/
│   │   │       ├── notebooks/    # 笔记本列表与工作区
│   │   │       ├── chat/         # 独立对话页
│   │   │       ├── knowledge/    # 知识图谱页
│   │   │       ├── tasks/        # 定时任务管理页
│   │   │       └── settings/     # 设置页
│   │   └── setup/            # 首次运行初始化向导
│   ├── features/             # 按功能域划分的业务组件
│   │   ├── editor/           # Tiptap 笔记编辑器
│   │   ├── chat/             # AI 对话界面
│   │   ├── copilot/          # AI 副驾驶侧边栏
│   │   ├── notebook/         # 笔记本卡片与工作区布局
│   │   ├── source/           # 来源导入与阅读面板
│   │   ├── artifacts/        # AI 生成内容卡片
│   │   ├── knowledge/        # 知识图谱查看器
│   │   ├── tasks/            # 定时任务卡片
│   │   └── auth/             # 认证 Provider
│   ├── components/           # 通用 UI 组件
│   ├── services/             # 与后端 API 通信的服务层
│   ├── store/                # Zustand 全局状态
│   ├── hooks/                # 自定义 React Hooks
│   ├── lib/                  # 工具函数（HTTP 客户端、API 路由、数据映射）
│   └── i18n/                 # 国际化配置与翻译文件
├── public/                   # 静态资源
├── package.json
├── tailwind.config.ts
├── next.config.ts
└── .env.local                # 本地环境变量
```

---

## 页面路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 落地页 | 产品介绍与功能展示 |
| `/login` | 登录页 | 邮箱密码登录 / OAuth |
| `/setup` | 初始化向导 | 首次运行配置 LLM、存储等 |
| `/app/notebooks` | 笔记本列表 | 所有笔记本的卡片视图 |
| `/app/notebooks/[id]` | 笔记本工作区 | 笔记编辑器 + AI 副驾驶 |
| `/app/chat` | 独立对话页 | 不绑定笔记本的全局 AI 对话 |
| `/app/knowledge` | 知识图谱 | 实体关系力导向图可视化 |
| `/app/tasks` | 定时任务 | 查看与管理自动化任务 |
| `/app/settings` | 设置 | 账号、模型、存储等配置 |
| `/notebooks/[id]` | 公开笔记本 | 只读的公开分享视图 |

---

## 核心功能模块

### 笔记编辑器（`features/editor/`）
- 基于 **Tiptap** 的富文本编辑器，支持 Markdown 快捷键
- AI 内联润色（幽灵文字建议，Tab 接受）
- 选中文本操作菜单（AI 解释、扩写、缩写等）
- 工具栏（标题、粗斜体、列表、代码块、引用等）
- 自动保存

### AI 对话（`features/chat/`）
- 流式 SSE 对话，实时展示 AI 回复
- 引用溯源（AI 回复中可跳转到具体来源段落）
- 深度研究进度 UI（展示多步骤研究过程）
- 内嵌文档查看器（对话中直接浏览来源 PDF / 网页）
- 消息评价（点赞 / 点踩）

### AI 副驾驶（`features/copilot/`）
- 浮动副驾驶球（悬浮于编辑器旁）
- 侧边栏 AI 面板，与当前笔记本上下文对话
- 思维导图视图（`markmap` 渲染）
- 主动洞察卡片（AI 主动推送相关知识点）
- 内联引用标注

### 来源管理（`features/source/`）
- 支持导入 PDF 文件、网页 URL、Markdown 文本
- 来源阅读面板（与 AI 对话联动）
- 来源列表与元数据展示

### 知识图谱（`features/knowledge/`）
- `react-force-graph-2d` 力导向图
- 点击节点展示实体详情
- 支持缩放、拖拽、搜索过滤

### 定时任务（`features/tasks/`）
- 创建 Cron 自动化任务（新闻摘要、知识简报等）
- 查看任务执行历史与结果

---

## 状态管理

| Store | 文件 | 职责 |
|---|---|---|
| Auth Store | `store/use-auth-store.ts` | JWT Token、用户信息 |
| Notebook Store | `store/use-notebook-store.ts` | 笔记本列表、当前激活笔记本 |
| UI Store | `store/use-ui-store.ts` | 侧边栏、面板开关等 UI 状态 |
| Proactive Store | `store/use-proactive-store.ts` | AI 主动洞察状态 |

---

## 服务层

`src/services/` 中每个文件对应一个后端业务域，统一通过 `src/lib/http-client.ts` 发起 HTTP 请求：

- `ai-service.ts` — AI 对话（SSE 流式）
- `auth-service.ts` — 登录注册
- `notebook-service.ts` — 笔记本 CRUD
- `note-service.ts` — 笔记 CRUD
- `source-service.ts` — 来源管理
- `conversation-service.ts` — 对话历史
- `memory-service.ts` — 长期记忆
- `skill-service.ts` — 技能插件
- `task-service.ts` — 定时任务
- `knowledge-graph-service.ts` — 知识图谱
- `config-service.ts` — 系统配置
- `feedback-service.ts` — 消息评价
- `public-service.ts` — 公开分享

---

## 环境变量

在 `web/` 目录下创建 `.env.local`：

```env
# 后端 API 地址
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# 是否使用 Mock 数据（开发调试用，true/false）
NEXT_PUBLIC_USE_MOCK=false
```

---

## 本地开发

### 前置依赖

- Node.js 20+
- pnpm

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

访问 `http://localhost:3000`

### 构建生产版本

```bash
pnpm build
pnpm start
```

### 代码检查

```bash
pnpm lint
```

---

## Docker 部署

推荐使用项目根目录的 `docker-compose.yml`：

```bash
# 从项目根目录运行
docker compose up -d
```

前端服务将在 `http://localhost:3000` 可访问。
