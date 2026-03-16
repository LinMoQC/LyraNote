#!/usr/bin/env bash
# LyraNote 本地开发启动脚本
# 用法：
#   ./start.sh          —— 启动所有服务（Docker 模式）
#   ./start.sh local    —— 启动本地 Python 进程（需要本地 Postgres + Redis）
#   ./start.sh stop     —— 停止所有 Docker 服务
#   ./start.sh logs     —— 查看 Docker 日志

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT_DIR/api"
WEB_DIR="$ROOT_DIR/web"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()    { echo -e "${GREEN}[LyraNote]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
section(){ echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ─── 检查依赖 ────────────────────────────────────────────────────────────────

check_command() {
  command -v "$1" &>/dev/null || error "$1 未安装，请先安装后重试。"
}

# ─── Docker 模式（默认）──────────────────────────────────────────────────────

start_docker() {
  section "检查环境"
  check_command docker
  check_command docker-compose || check_command docker  # docker compose v2

  # 确保 api/.env 存在
  if [ ! -f "$API_DIR/.env" ]; then
    warn "api/.env 不存在，从 .env.example 复制..."
    cp "$API_DIR/.env.example" "$API_DIR/.env"
    warn "请编辑 api/.env，填入 OPENAI_API_KEY 等配置后重新运行。"
    exit 1
  fi

  # 检查 OPENAI_API_KEY 是否已填写
  if grep -q 'OPENAI_API_KEY=sk-\.\.\.' "$API_DIR/.env"; then
    warn "api/.env 中的 OPENAI_API_KEY 仍为占位符，AI 功能将无法使用。"
    warn "请编辑 api/.env 并填入真实的 API Key。"
  fi

  section "启动 Docker Compose 服务"
  cd "$ROOT_DIR"

  # 构建镜像（仅在有变化时）
  log "构建镜像..."
  docker compose build --quiet

  log "启动服务（db → redis → api → worker → web）..."
  docker compose up -d

  section "等待服务就绪"
  log "等待数据库..."
  for i in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U lyranote &>/dev/null; then
      log "数据库已就绪 ✓"
      break
    fi
    [ "$i" -eq 30 ] && error "数据库启动超时"
    sleep 1
  done

  log "等待 API 服务..."
  for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health &>/dev/null; then
      log "API 已就绪 ✓"
      break
    fi
    [ "$i" -eq 30 ] && error "API 启动超时"
    sleep 2
  done

  section "启动完成"
  echo ""
  echo -e "  ${GREEN}前端${NC}    http://localhost:3000"
  echo -e "  ${GREEN}API${NC}     http://localhost:8000"
  echo -e "  ${GREEN}API 文档${NC} http://localhost:8000/docs"
  echo ""
  echo -e "  查看日志：${CYAN}./start.sh logs${NC}"
  echo -e "  停止服务：${CYAN}./start.sh stop${NC}"
  echo ""
}

# ─── 本地进程模式 ─────────────────────────────────────────────────────────────
# 数据层（Postgres + Redis）优先复用已有容器/进程，否则自动用 Docker 启动。
# Python / Node 应用进程始终在本地运行，方便热重载调试。

_tcp_ready() {
  # 用 bash TCP 伪设备探测端口，不依赖 nc / redis-cli / pg_isready
  (echo > /dev/tcp/"$1"/"$2") &>/dev/null
}

_wait_tcp() {
  local host=$1 port=$2 name=$3 retries=${4:-25}
  for i in $(seq 1 "$retries"); do
    if _tcp_ready "$host" "$port"; then
      log "$name 已就绪 ✓ ($host:$port)"
      return 0
    fi
    sleep 1
  done
  error "$name 在 $host:$port 启动超时"
}

start_local() {
  section "本地模式启动（应用层本地，数据层按需启动）"
  check_command python3
  check_command node
  check_command pnpm
  check_command docker

  # 确保 api/.env 存在
  if [ ! -f "$API_DIR/.env" ]; then
    warn "api/.env 不存在，从 .env.example 复制..."
    cp "$API_DIR/.env.example" "$API_DIR/.env"
    warn "请编辑 api/.env，填入 OPENAI_API_KEY 等配置后重新运行。"
    exit 1
  fi

  if grep -q 'OPENAI_API_KEY=sk-\.\.\.' "$API_DIR/.env"; then
    warn "api/.env 中的 OPENAI_API_KEY 仍为占位符，AI 功能将无法使用。"
  fi

  section "检查数据层"
  cd "$ROOT_DIR"

  # PostgreSQL :5432
  # LyraNote 专用的 pgvector 容器跑在 5433，避免与其他项目的 Postgres 冲突
  if _tcp_ready localhost 5433; then
    log "复用已有 lyranote-db 实例 (localhost:5433) ✓"
  else
    log "未检测到 lyranote-db，启动 pgvector 容器..."
    docker run -d \
      --name lyranote-db \
      -e POSTGRES_USER=lyranote \
      -e POSTGRES_PASSWORD=lyranote \
      -e POSTGRES_DB=lyranote \
      -p 5433:5432 \
      pgvector/pgvector:pg16 2>/dev/null || docker start lyranote-db
    _wait_tcp localhost 5433 "PostgreSQL(pgvector)" 30
  fi

  # Redis :6379
  if _tcp_ready localhost 6379; then
    log "复用已有 Redis 实例 (localhost:6379) ✓"
  else
    log "未检测到 Redis，用 Docker 启动..."
    docker compose up -d redis
    _wait_tcp localhost 6379 "Redis" 20
  fi

  # 检查并创建 Python 虚拟环境
  if [ ! -d "$API_DIR/.venv" ]; then
    section "创建 Python 虚拟环境"
    python3 -m venv "$API_DIR/.venv"
  fi

  source "$API_DIR/.venv/bin/activate"

  section "安装 Python 依赖"
  pip install -q --upgrade pip
  pip install -q -r "$API_DIR/requirements.txt"
  log "Python 依赖已就绪 ✓"

  section "执行数据库迁移"
  cd "$API_DIR"
  alembic upgrade head
  log "数据库迁移完成 ✓"

  section "安装前端依赖"
  cd "$WEB_DIR"
  pnpm install --silent
  log "前端依赖已就绪 ✓"

  section "启动应用层进程"
  cd "$API_DIR"

  log "启动 FastAPI (port 8000)..."
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
  API_PID=$!

  log "启动 Celery Worker..."
  celery -A app.workers.tasks.celery_app worker --loglevel=info --concurrency=2 &
  WORKER_PID=$!

  cd "$WEB_DIR"
  log "启动 Next.js (port 3000)..."
  pnpm dev &
  WEB_PID=$!

  section "所有服务已启动"
  echo ""
  echo -e "  ${GREEN}前端${NC}     http://localhost:3000"
  echo -e "  ${GREEN}API${NC}      http://localhost:8000"
  echo -e "  ${GREEN}API 文档${NC}  http://localhost:8000/docs"
  echo ""
  echo "  按 Ctrl+C 停止本地进程（数据层容器不受影响）"
  echo ""

  trap "kill $API_PID $WORKER_PID $WEB_PID 2>/dev/null; log '本地进程已停止。'; exit 0" INT TERM
  wait
}

# ─── 停止服务 ─────────────────────────────────────────────────────────────────

stop_docker() {
  section "停止 Docker Compose 服务"
  cd "$ROOT_DIR"
  docker compose down
  log "所有服务已停止。"
}

# ─── 日志 ────────────────────────────────────────────────────────────────────

show_logs() {
  cd "$ROOT_DIR"
  docker compose logs -f --tail=100
}

# ─── 入口 ─────────────────────────────────────────────────────────────────────

case "${1:-docker}" in
  docker)   start_docker ;;
  local)    start_local ;;
  stop)     stop_docker ;;
  logs)     show_logs ;;
  *)
    echo "用法: $0 [docker|local|stop|logs]"
    echo ""
    echo "  docker  (默认) 用 Docker Compose 启动全部服务"
    echo "  local          本地 Python 进程模式（需自备 Postgres + Redis）"
    echo "  stop           停止 Docker Compose 服务"
    echo "  logs           查看 Docker 日志"
    ;;
esac
