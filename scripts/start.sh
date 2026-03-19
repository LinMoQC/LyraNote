#!/usr/bin/env bash
# LyraNote 启动脚本
# 无参数：交互式菜单
# 有参数：./start.sh [docker|local|stop|logs|status|build]

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT_DIR/api"
WEB_DIR="$ROOT_DIR/web"

# ─── 颜色 & 输出 ──────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log()     { echo -e "${GREEN}✔${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✘${NC}  $*"; exit 1; }
info()    { echo -e "${CYAN}ℹ${NC}  $*"; }
section() { echo -e "\n${BOLD}${CYAN}── $* ──${NC}"; }
dim()     { echo -e "${DIM}$*${NC}"; }

# ─── 工具函数 ─────────────────────────────────────────────────────────────────

check_command() {
  command -v "$1" &>/dev/null || error "'$1' 未安装，请先安装后重试。"
}

_tcp_ready() {
  nc -z "$1" "$2" &>/dev/null
}

_check_port() {
  local port=$1 name=$2
  if lsof -i ":$port" -sTCP:LISTEN -t &>/dev/null; then
    local pid
    pid=$(lsof -i ":$port" -sTCP:LISTEN -t | head -1)
    local pname
    pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
    warn "$name 端口 $port 被占用 (PID $pid - $pname)"
    read -rp "  是否终止该进程？[y/N] " ans
    if [[ "$ans" =~ ^[Yy]$ ]]; then
      kill -9 "$pid" && log "已终止 PID $pid"
      sleep 1
    else
      error "端口 $port 被占用，无法启动 $name"
    fi
  fi
}

_wait_tcp() {
  local host=$1 port=$2 name=$3 retries=${4:-25}
  for i in $(seq 1 "$retries"); do
    if _tcp_ready "$host" "$port"; then
      log "$name 已就绪 ($host:$port)"
      return 0
    fi
    printf "  ${DIM}等待 $name...${NC} %ds\r" "$i"
    sleep 1
  done
  error "$name 在 $host:$port 启动超时"
}

# ─── Banner ───────────────────────────────────────────────────────────────────

print_banner() {
  echo -e "${BOLD}${CYAN}"
  echo '  ██╗  ██╗   ██╗██████╗  █████╗ ███╗   ██╗ ██████╗ ████████╗███████╗'
  echo '  ██║  ╚██╗ ██╔╝██╔══██╗██╔══██╗████╗  ██║██╔═══██╗╚══██╔══╝██╔════╝'
  echo '  ██║   ╚████╔╝ ██████╔╝███████║██╔██╗ ██║██║   ██║   ██║   █████╗  '
  echo '  ██║    ╚██╔╝  ██╔══██╗██╔══██║██║╚██╗██║██║   ██║   ██║   ██╔══╝  '
  echo '  ███████╗██║   ██║  ██║██║  ██║██║ ╚████║╚██████╔╝   ██║   ███████╗'
  echo '  ╚══════╝╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ╚══════╝'
  echo -e "${NC}"
  echo -e "  ${DIM}AI 驱动的笔记与知识管理系统${NC}"
  echo ""
}

# ─── 状态检查 ─────────────────────────────────────────────────────────────────

show_status() {
  section "服务状态"
  echo ""

  # Docker 容器状态
  if command -v docker &>/dev/null; then
    local containers=(lyranote-api-1 lyranote-worker-1 lyranote-web-1 lyranote-db-1 lyranote-redis-1 lyranote-minio-1)
    printf "  %-28s %s\n" "${BOLD}容器${NC}" "${BOLD}状态${NC}"
    echo -e "  ${DIM}$(printf '─%.0s' {1..40})${NC}"
    for c in "${containers[@]}"; do
      local status
      status=$(docker inspect --format='{{.State.Status}}' "$c" 2>/dev/null || echo "未运行")
      if [ "$status" = "running" ]; then
        printf "  %-28s ${GREEN}● 运行中${NC}\n" "$c"
      else
        printf "  %-28s ${RED}○ %-8s${NC}\n" "$c" "$status"
      fi
    done
  else
    warn "未安装 Docker，跳过容器状态检查"
  fi

  echo ""

  # 端口可达性
  printf "  %-28s %s\n" "${BOLD}服务端点${NC}" "${BOLD}可达性${NC}"
  echo -e "  ${DIM}$(printf '─%.0s' {1..40})${NC}"
  local endpoints=("前端:localhost:3000" "API:localhost:8000" "MinIO:localhost:9001" "PostgreSQL:localhost:5433" "Redis:localhost:6379")
  for ep in "${endpoints[@]}"; do
    local name host port
    name="${ep%%:*}"
    host="${ep#*:}"; host="${host%:*}"
    port="${ep##*:}"
    if _tcp_ready "$host" "$port"; then
      printf "  %-28s ${GREEN}● 可达${NC}\n" "$name ($host:$port)"
    else
      printf "  %-28s ${DIM}○ 不可达${NC}\n" "$name ($host:$port)"
    fi
  done
  echo ""
}

# ─── Docker 模式 ──────────────────────────────────────────────────────────────

start_docker() {
  section "Docker Compose 模式"
  check_command docker

  if [ ! -f "$API_DIR/.env" ]; then
    warn "api/.env 不存在，从 .env.example 复制..."
    cp "$API_DIR/.env.example" "$API_DIR/.env"
    echo ""
    warn "请先编辑 ${BOLD}api/.env${NC}，填入 OPENAI_API_KEY 等配置后重新运行。"
    echo ""
    read -rp "  现在用编辑器打开？[Y/n] " ans
    if [[ "${ans:-y}" =~ ^[Yy]$ ]]; then
      "${EDITOR:-vi}" "$API_DIR/.env"
    else
      exit 1
    fi
  fi

  if grep -qE 'OPENAI_API_KEY=(sk-\.\.\.|)$' "$API_DIR/.env" 2>/dev/null; then
    warn "OPENAI_API_KEY 未填写，AI 功能将无法使用。"
    echo ""
    read -rp "  继续启动？[Y/n] " ans
    [[ "${ans:-y}" =~ ^[Yy]$ ]] || exit 0
  fi

  cd "$ROOT_DIR"

  _check_port 8000 "API"
  _check_port 3000 "Web"

  info "构建镜像（仅变化时重建）..."
  docker compose build --quiet

  info "启动服务..."
  docker compose up -d

  section "等待服务就绪"
  for i in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U lyranote &>/dev/null; then
      log "数据库已就绪"; break
    fi
    [ "$i" -eq 30 ] && error "数据库启动超时"
    sleep 1
  done

  for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health &>/dev/null; then
      log "API 已就绪"; break
    fi
    [ "$i" -eq 30 ] && error "API 启动超时"
    sleep 2
  done

  _print_access_info
}

# ─── 仅重建镜像 ───────────────────────────────────────────────────────────────

build_images() {
  section "重新构建镜像"
  check_command docker
  cd "$ROOT_DIR"
  docker compose build
  log "镜像构建完成"
}

# ─── 本地进程模式 ─────────────────────────────────────────────────────────────

start_local() {
  section "本地开发模式（应用层本地 + 数据层 Docker）"
  check_command python3
  check_command node
  check_command pnpm
  check_command docker

  if [ ! -f "$API_DIR/.env" ]; then
    warn "api/.env 不存在，从 .env.example 复制..."
    cp "$API_DIR/.env.example" "$API_DIR/.env"
    echo ""
    warn "请先编辑 ${BOLD}api/.env${NC}，填入 OPENAI_API_KEY 等配置后重新运行。"
    read -rp "  现在用编辑器打开？[Y/n] " ans
    if [[ "${ans:-y}" =~ ^[Yy]$ ]]; then
      "${EDITOR:-vi}" "$API_DIR/.env"
    else
      exit 1
    fi
  fi

  if grep -qE 'OPENAI_API_KEY=(sk-\.\.\.|)$' "$API_DIR/.env" 2>/dev/null; then
    warn "OPENAI_API_KEY 未填写，AI 功能将无法使用。"
  fi

  section "检查数据层"
  cd "$ROOT_DIR"

  if _tcp_ready localhost 5433; then
    log "复用已有 PostgreSQL (localhost:5433)"
  else
    info "启动 pgvector 容器..."
    docker run -d \
      --name lyranote-db \
      -e POSTGRES_USER=lyranote \
      -e POSTGRES_PASSWORD=lyranote \
      -e POSTGRES_DB=lyranote \
      -p 5433:5432 \
      pgvector/pgvector:pg16 2>/dev/null || docker start lyranote-db
    _wait_tcp localhost 5433 "PostgreSQL" 30
  fi

  if _tcp_ready localhost 6379; then
    log "复用已有 Redis (localhost:6379)"
  else
    info "启动 Redis 容器..."
    docker compose up -d redis
    _wait_tcp localhost 6379 "Redis" 20
  fi

  if _tcp_ready localhost 9000; then
    log "复用已有 MinIO (localhost:9000)"
  else
    info "启动 MinIO 容器..."
    docker compose up -d minio minio-init
    _wait_tcp localhost 9000 "MinIO" 20
  fi

  section "Python 环境"
  if [ ! -d "$API_DIR/.venv" ]; then
    info "创建虚拟环境..."
    if command -v pyenv &>/dev/null; then
      PYENV_VERSION=3.12.0 pyenv exec python -m venv "$API_DIR/.venv" 2>/dev/null || \
      python3 -m venv "$API_DIR/.venv"
    else
      python3 -m venv "$API_DIR/.venv"
    fi
  fi
  VENV_PYTHON="$API_DIR/.venv/bin/python"
  info "安装/更新依赖..."
  "$VENV_PYTHON" -m pip install -q --upgrade pip
  "$VENV_PYTHON" -m pip install -q -r "$API_DIR/requirements.txt"
  log "Python 依赖已就绪"

  section "数据库迁移"
  cd "$API_DIR"
  "$API_DIR/.venv/bin/alembic" upgrade head
  log "迁移完成"

  section "前端依赖"
  cd "$WEB_DIR"
  pnpm install --silent
  log "前端依赖已就绪"

  section "启动应用进程"
  _check_port 8000 "FastAPI"
  _check_port 3000 "Next.js"

  cd "$API_DIR"
  info "FastAPI (port 8000)..."
  "$API_DIR/.venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 --reload &
  API_PID=$!

  info "Celery Worker..."
  "$API_DIR/.venv/bin/celery" -A app.workers.tasks.celery_app worker --loglevel=info --concurrency=2 &
  WORKER_PID=$!

  cd "$WEB_DIR"
  info "Next.js (port 3000)..."
  pnpm dev &
  WEB_PID=$!

  _print_access_info
  echo -e "  ${DIM}按 Ctrl+C 停止本地进程（数据层容器不受影响）${NC}"
  echo ""

  trap "echo ''; log '正在停止本地进程...'; kill \$API_PID \$WORKER_PID \$WEB_PID 2>/dev/null; log '已停止。'; exit 0" INT TERM
  wait
}

# ─── 停止 ─────────────────────────────────────────────────────────────────────

stop_docker() {
  section "停止 Docker Compose 服务"
  cd "$ROOT_DIR"

  echo ""
  echo -e "  ${YELLOW}选择停止方式：${NC}"
  echo -e "  ${BOLD}1${NC}  停止容器（保留数据）"
  echo -e "  ${BOLD}2${NC}  停止并删除容器（保留 volume 数据）"
  echo -e "  ${BOLD}3${NC}  停止并清除所有数据（${RED}不可恢复${NC}）"
  echo -e "  ${BOLD}0${NC}  取消"
  echo ""
  read -rp "  请选择 [1]: " choice

  case "${choice:-1}" in
    1) docker compose stop;   log "服务已停止（数据保留）" ;;
    2) docker compose down;   log "容器已删除（volume 保留）" ;;
    3)
      echo ""
      read -rp "  ${RED}确认清除所有数据？${NC} 输入 'yes' 确认: " confirm
      if [ "$confirm" = "yes" ]; then
        docker compose down -v --remove-orphans
        log "所有容器和数据已清除"
      else
        info "已取消"
      fi
      ;;
    0) info "已取消"; exit 0 ;;
    *) warn "无效选项"; exit 1 ;;
  esac
}

# ─── 日志 ─────────────────────────────────────────────────────────────────────

show_logs() {
  section "查看日志"
  cd "$ROOT_DIR"

  echo ""
  echo -e "  ${YELLOW}选择要查看的服务：${NC}"
  echo -e "  ${BOLD}1${NC}  所有服务"
  echo -e "  ${BOLD}2${NC}  API"
  echo -e "  ${BOLD}3${NC}  Worker"
  echo -e "  ${BOLD}4${NC}  Web"
  echo -e "  ${BOLD}5${NC}  数据库"
  echo -e "  ${BOLD}6${NC}  Redis"
  echo ""
  read -rp "  请选择 [1]: " choice

  case "${choice:-1}" in
    1) docker compose logs -f --tail=100 ;;
    2) docker compose logs -f --tail=100 api ;;
    3) docker compose logs -f --tail=100 worker ;;
    4) docker compose logs -f --tail=100 web ;;
    5) docker compose logs -f --tail=100 db ;;
    6) docker compose logs -f --tail=100 redis ;;
    *) warn "无效选项" ;;
  esac
}

# ─── 输出访问信息 ─────────────────────────────────────────────────────────────

_print_access_info() {
  echo ""
  echo -e "  ${BOLD}${GREEN}🎉 启动成功！${NC}"
  echo ""
  echo -e "  ${BOLD}前端应用${NC}    ${CYAN}http://localhost:3000${NC}"
  echo -e "  ${BOLD}API 服务${NC}    ${CYAN}http://localhost:8000${NC}"
  echo -e "  ${BOLD}API 文档${NC}    ${CYAN}http://localhost:8000/docs${NC}"
  echo -e "  ${BOLD}MinIO 控制台${NC} ${CYAN}http://localhost:9001${NC}  ${DIM}(lyranote / lyranote123)${NC}"
  echo ""
  echo -e "  ${DIM}查看日志：./start.sh logs    停止服务：./start.sh stop${NC}"
  echo ""
}

# ─── 交互式主菜单 ─────────────────────────────────────────────────────────────

interactive_menu() {
  while true; do
    clear
    print_banner

    echo -e "  ${BOLD}请选择操作：${NC}"
    echo ""
    echo -e "  ${BOLD}${GREEN}1${NC}  🐳  Docker 模式启动    ${DIM}（推荐，一键启动全部服务）${NC}"
    echo -e "  ${BOLD}${GREEN}2${NC}  💻  本地模式启动       ${DIM}（本地调试，数据层用 Docker）${NC}"
    echo -e "  ${BOLD}${YELLOW}3${NC}  📊  查看服务状态"
    echo -e "  ${BOLD}${YELLOW}4${NC}  📋  查看日志"
    echo -e "  ${BOLD}${YELLOW}5${NC}  🔨  重新构建镜像"
    echo -e "  ${BOLD}${RED}6${NC}  ⏹   停止服务"
    echo -e "  ${BOLD}0${NC}  ✕   退出"
    echo ""
    read -rp "  请输入选项: " choice
    echo ""

    case "$choice" in
      1) start_docker;  _pause ;;
      2) start_local ;;
      3) show_status;   _pause ;;
      4) show_logs ;;
      5) build_images;  _pause ;;
      6) stop_docker;   _pause ;;
      0) echo -e "  ${DIM}再见！${NC}"; echo ""; exit 0 ;;
      *) warn "无效选项，请重试"; sleep 1 ;;
    esac
  done
}

_pause() {
  echo ""
  read -rp "  按 Enter 返回菜单..." _
}

# ─── 入口 ─────────────────────────────────────────────────────────────────────

case "${1:-}" in
  "")       interactive_menu ;;
  docker)   start_docker ;;
  local)    start_local ;;
  stop)     stop_docker ;;
  logs)     show_logs ;;
  status)   show_status ;;
  build)    build_images ;;
  *)
    echo ""
    echo -e "  用法: ${BOLD}$0 [命令]${NC}"
    echo ""
    echo -e "  ${BOLD}命令：${NC}"
    echo -e "    ${CYAN}(无参数)${NC}  交互式菜单"
    echo -e "    docker    Docker Compose 一键启动"
    echo -e "    local     本地开发模式"
    echo -e "    stop      停止服务"
    echo -e "    logs      查看日志"
    echo -e "    status    查看服务状态"
    echo -e "    build     重新构建镜像"
    echo ""
    ;;
esac
