# 快速上手

欢迎使用 LyraNote — 一款以 AI 为核心的个人知识管理系统。本指南将帮助你在几分钟内完成安装并运行自己的实例。

## 环境要求

开始之前，请确保已具备：

- [Docker](https://www.docker.com/) 和 [Docker Compose](https://docs.docker.com/compose/) v2+
- [OpenAI 兼容的 API 密钥](https://platform.openai.com/api-keys)（支持 OpenAI、DeepSeek 或 Ollama）
- （可选）[Tavily API 密钥](https://tavily.com/)，用于深度研究的网络搜索

## 快速启动

### 1. 克隆仓库

```bash
git clone https://github.com/LinMoQC/LyraNote.git
cd LyraNote
```

### 2. 配置环境变量

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

打开 `api/.env` 并填入必要配置：

```bash
# 必填
OPENAI_API_KEY=sk-...
SECRET_KEY=你的随机密钥

# 可选 — 切换 LLM 提供商
OPENAI_BASE_URL=https://api.deepseek.com   # 或 Ollama 地址
LLM_MODEL=gpt-4o-mini

# 可选 — 启用深度研究网络搜索
TAVILY_API_KEY=tvly-...

# 调试模式：跳过鉴权，无需配置 Clerk
DEBUG=true
```

> **提示**：本地开发时设置 `DEBUG=true` 可跳过 Clerk 鉴权，直接使用。

### 3. 启动应用

使用内置的 `lyra` CLI 一键启动所有服务：

```bash
./lyra start
```

启动的服务列表：

| 服务 | 说明 |
|---|---|
| PostgreSQL 16 | 数据库（含 pgvector 扩展） |
| Redis | 任务队列和缓存 |
| MinIO | 文件对象存储 |
| FastAPI API | 后端，端口 `8000` |
| Next.js Web | 前端，端口 `3000` |
| Celery Worker | 后台任务处理器 |

### 4. 执行数据库迁移

首次启动后，需应用数据库 Schema：

```bash
docker compose exec api alembic upgrade head
```

### 5. 打开 LyraNote

在浏览器中访问 `http://localhost:3000`。

## 常用 CLI 命令

| 命令 | 描述 |
|---|---|
| `./lyra start` | 启动所有服务 |
| `./lyra dev` | 以开发模式启动（热重载） |
| `./lyra stop` | 停止所有服务 |
| `./lyra logs` | 查看所有容器日志 |
| `./lyra status` | 检查容器健康状态 |

## 最小必填环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_URL` | Redis 连接串 |
| `OPENAI_API_KEY` | LLM API 密钥 |
| `OPENAI_BASE_URL` | 可切换为 DeepSeek / Ollama 地址 |
| `LLM_MODEL` | 默认：`gpt-4o-mini` |
| `DEBUG` | 设为 `true` 跳过 Clerk 鉴权 |

## 下一步

- [AI 对话](./features/ai-chat) — 与知识库对话
- [知识图谱](./features/knowledge-graph) — 可视化实体关系
- [深度研究](./features/deep-research) — 运行多步骤 AI 研究
- [定时任务](./features/scheduled-tasks) — 自动化周期性研究工作流
- [部署指南](./deployment) — 部署到生产服务器
