# 部署指南

本指南介绍如何使用附带的 Docker Compose 生产配置将 LyraNote 部署到生产服务器。

## 架构概览

一个生产环境的 LyraNote 部署由以下服务组成：

| 服务 | 说明 |
|---|---|
| `nginx` | 反向代理、SSL 终止、静态文件服务 |
| `web` | Next.js 前端（SSR） |
| `api` | FastAPI 后端 |
| `postgres` | PostgreSQL 16（含 pgvector 扩展） |
| `redis` | 任务队列和缓存 |
| `minio` | S3 兼容的文件上传对象存储 |
| `celery` | 后台任务 Worker |
| `celery-beat` | 周期性任务调度器（用于定时任务） |

## 环境要求

- 已安装 Docker 和 Docker Compose v2 的 Linux 服务器
- 指向服务器 IP 的域名
- 防火墙开放 `80` 和 `443` 端口

## 第一步：克隆并配置

```bash
git clone https://github.com/LinMoQC/LyraNote.git
cd LyraNote
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

使用生产环境值编辑 `api/.env`：

```bash
OPENAI_API_KEY=sk-...
SECRET_KEY=<生成一个长随机字符串>
DATABASE_URL=postgresql+asyncpg://lyra:yourpassword@postgres:5432/lyranote
REDIS_URL=redis://redis:6379/0

# 文件存储（默认 MinIO，可切换为 S3/OSS/R2）
STORAGE_BACKEND=minio
STORAGE_S3_ENDPOINT_URL=http://minio:9000
STORAGE_S3_BUCKET=lyranote
STORAGE_S3_ACCESS_KEY=minioadmin
STORAGE_S3_SECRET_KEY=<安全密码>

# 可选功能
TAVILY_API_KEY=tvly-...          # 深度研究网络搜索
SMTP_HOST=smtp.gmail.com         # 定时任务邮件投递
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password
```

编辑 `web/.env.local`：

```bash
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
```

## 第二步：配置 Nginx

编辑 `nginx.prod.conf`，将 `yourdomain.com` 替换为你的实际域名。

## 第三步：配置 SSL

LyraNote 的 Nginx 配置需要以下路径的 SSL 证书：
- `/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
- `/etc/letsencrypt/live/yourdomain.com/privkey.pem`

使用 [Certbot](https://certbot.eff.org/) 获取免费的 Let's Encrypt 证书：

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com
```

## 第四步：启动生产服务

```bash
docker compose -f docker-compose.prod.yml up -d
```

## 第五步：执行数据库迁移

```bash
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

## 更新升级

```bash
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

## 文件存储选项

LyraNote 支持多种文件存储后端，通过修改 `api/.env` 中的 `STORAGE_BACKEND` 切换：

| 后端 | `STORAGE_BACKEND` 值 | 备注 |
|---|---|---|
| 本地文件系统 | `local` | 适合单服务器部署 |
| MinIO（自托管） | `minio` | S3 兼容，已包含在 Docker Compose 中 |
| AWS S3 | `s3` | 配置 `STORAGE_S3_BUCKET`、`ACCESS_KEY` 等 |
| 阿里云 OSS | `oss` | 将 `STORAGE_S3_ENDPOINT_URL` 设为 OSS Endpoint |
| Cloudflare R2 | `r2` | 将 `STORAGE_S3_ENDPOINT_URL` 设为 R2 Endpoint |

## 监控

查看任意服务的日志：

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f celery
```

## 数据备份

定期备份 PostgreSQL 数据库：

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U lyra lyranote > backup_$(date +%Y%m%d).sql
```

文件存储方面，备份 MinIO 数据卷，或在你的 S3 兼容提供商上配置复制策略。
