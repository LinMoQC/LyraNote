import { runDevTUI } from '../tui/runDevTUI.js';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { section, log, warn, info, printAccessInfo, waitTcp, tcpReady } from '../utils/ui.js';
import { checkCommand, checkPort, prompt, exec, execQ } from '../utils/proc.js';
import { ROOT_DIR, API_DIR, WEB_DIR, MONITORING_DIR } from '../utils/paths.js';

const VENV = path.join(API_DIR, '.venv');
const APP_CONTAINER_NAMES = ['lyranote-api-1', 'lyranote-worker-1', 'lyranote-beat-1', 'lyranote-web-1', 'lyranote-monitoring-1'];
const MONITORING_PORT = 3100;
const MONITORING_ORIGIN = `http://localhost:${MONITORING_PORT}`;

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function mergeOrigins(existing, nextOrigin) {
  const origins = String(existing || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!origins.includes(nextOrigin)) {
    origins.push(nextOrigin);
  }
  return origins.join(',');
}

function listPidsByPattern(pattern) {
  const out = execQ(`pgrep -f ${shQuote(pattern)}`);
  return out.split(/\s+/).filter(Boolean);
}

function describePid(pid) {
  return execQ(`ps -p ${pid} -o command= 2>/dev/null`) || 'unknown';
}

async function terminatePids(pids, label) {
  if (!pids.length) return;

  for (const pid of pids) {
    try {
      exec(`kill ${pid}`, { shell: true, stdio: 'ignore' });
    } catch { /* ignore */ }
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  const survivors = pids.filter((pid) => !!execQ(`ps -p ${pid} -o pid= 2>/dev/null`));
  for (const pid of survivors) {
    try {
      exec(`kill -9 ${pid}`, { shell: true, stdio: 'ignore' });
    } catch { /* ignore */ }
  }

  log(`已清理 ${label} 残留进程 ${pids.join(', ')}`);
}

async function cleanupWorkspacePort(port, label) {
  const pid = execQ(`lsof -i :${port} -sTCP:LISTEN -t 2>/dev/null | head -1`);
  if (!pid) return;

  const command = describePid(pid);
  const cwd = execQ(`lsof -a -p ${pid} -d cwd -Fn 2>/dev/null | tail -n 1 | sed 's/^n//'`);
  const belongsToWorkspace = command.includes(ROOT_DIR) || cwd.startsWith(ROOT_DIR);

  if (!belongsToWorkspace) return;

  warn(`${label} 检测到 LyraNote 残留端口占用 (PID ${pid})`);
  await terminatePids([pid], `${label} 端口`);
}

async function cleanupStaleProcesses() {
  section('预清理残留进程');
  process.chdir(ROOT_DIR);

  const runningContainers = execQ("docker ps --format '{{.Names}}'")
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => APP_CONTAINER_NAMES.includes(name));

  if (runningContainers.length) {
    warn(`检测到残留应用容器：${runningContainers.join(', ')}`);
    try { exec('docker compose stop api worker beat web monitoring', { shell: true, cwd: ROOT_DIR, stdio: 'ignore' }); } catch { /* ignore */ }
    try { exec('docker compose -f docker-compose.prod.yml stop api worker beat web monitoring', { shell: true, cwd: ROOT_DIR, stdio: 'ignore' }); } catch { /* ignore */ }
    log('已停止残留应用层容器（保留数据层容器）');
  } else {
    info('未检测到残留应用层容器');
  }

  const uvicorn = path.join(VENV, 'bin', 'uvicorn');
  const celery = path.join(VENV, 'bin', 'celery');
  const patterns = [
    { label: 'API', pids: listPidsByPattern(`${uvicorn} app.main:app`) },
    { label: 'Celery Worker', pids: listPidsByPattern(`${celery} -A app.workers.tasks.celery_app worker`) },
    { label: 'Celery Beat', pids: listPidsByPattern(`${celery} -A app.workers.tasks.celery_app beat`) },
    { label: 'Monitoring', pids: listPidsByPattern('next dev --port 3100') },
  ];

  let cleaned = false;
  for (const item of patterns) {
    if (!item.pids.length) continue;
    cleaned = true;
    const preview = item.pids
      .slice(0, 2)
      .map((pid) => describePid(pid))
      .filter(Boolean)
      .join(' | ');
    if (preview) warn(`${item.label} 残留命令：${preview}`);
    await terminatePids(item.pids, item.label);
  }

  await cleanupWorkspacePort(8000, 'FastAPI');
  await cleanupWorkspacePort(3000, 'Next.js');
  await cleanupWorkspacePort(MONITORING_PORT, 'Monitoring');

  if (!cleaned) {
    info('未检测到残留 API / Worker / Beat 进程');
  }
}

async function ensureEnv() {
  const envFile = path.join(API_DIR, '.env');
  if (!fs.existsSync(envFile)) {
    warn('api/.env 不存在，从 .env.example 复制...');
    fs.copyFileSync(path.join(API_DIR, '.env.example'), envFile);
    warn(`请先编辑 ${envFile}，填入配置后重新运行。`);
    const ans = await prompt('  现在用编辑器打开？[Y/n] ');
    if (/^[Nn]$/.test(ans.trim())) process.exit(1);
    exec(`${process.env.EDITOR || 'vi'} "${envFile}"`, { shell: true });
  }
  const content = fs.readFileSync(path.join(API_DIR, '.env'), 'utf8');
  if (/OPENAI_API_KEY=(sk-\.\.\.|)\s*$/.test(content)) {
    warn('OPENAI_API_KEY 未填写，AI 功能将无法使用。');
  }
}

export async function startLocal() {
  section('本地开发模式（应用层本地 + 数据层 Docker）');
  checkCommand('python3');
  checkCommand('node');
  checkCommand('pnpm');
  checkCommand('docker');

  await ensureEnv();
  await cleanupStaleProcesses();

  // ── 数据层 ──
  section('检查数据层');
  process.chdir(ROOT_DIR);

  if (await tcpReady('localhost', 5433)) {
    log('复用已有 PostgreSQL (localhost:5433)');
  } else {
    const s = ora('启动 PostgreSQL 容器...').start();
    exec(
      'docker run -d --name lyranote-db -e POSTGRES_USER=lyranote -e POSTGRES_PASSWORD=lyranote -e POSTGRES_DB=lyranote -p 5433:5432 pgvector/pgvector:pg16 2>/dev/null || docker start lyranote-db',
      { shell: true, stdio: 'ignore' }
    );
    s.stop();
    await waitTcp('localhost', 5433, 'PostgreSQL', 30);
  }

  if (await tcpReady('localhost', 6379)) {
    log('复用已有 Redis (localhost:6379)');
  } else {
    exec('docker compose up -d redis', { shell: true, stdio: 'ignore' });
    await waitTcp('localhost', 6379, 'Redis', 20);
  }

  if (await tcpReady('localhost', 9000)) {
    log('复用已有 MinIO (localhost:9000)');
  } else {
    exec('docker compose up -d minio minio-init', { shell: true, stdio: 'ignore' });
    await waitTcp('localhost', 9000, 'MinIO', 20);
  }

  // ── Python 环境 ──
  section('Python 环境');
  if (!fs.existsSync(VENV)) {
    const s = ora('创建虚拟环境...').start();
    exec('python3 -m venv .venv', { shell: true, cwd: API_DIR });
    s.succeed('虚拟环境已创建');
  }
  const pip = path.join(VENV, 'bin', 'pip');
  const spinner = ora('安装/更新依赖...').start();
  exec(`"${pip}" install -q --upgrade pip`, { shell: true, stdio: 'ignore' });
  exec(`"${pip}" install -q -r requirements.txt`, { shell: true, cwd: API_DIR, stdio: 'ignore' });
  spinner.succeed('Python 依赖已就绪');

  // ── 数据库迁移 ──
  section('数据库迁移');
  const alembic = path.join(VENV, 'bin', 'alembic');
  exec(`"${alembic}" upgrade head`, { shell: true, cwd: API_DIR });
  log('迁移完成');

  // ── 前端依赖 ──
  section('前端依赖');
  const s2 = ora('pnpm install...').start();
  exec('pnpm install --silent', { shell: true, cwd: ROOT_DIR, stdio: 'ignore' });
  s2.succeed('前端依赖已就绪');

  // ── 启动 TUI + 进程 ──
  section('启动应用进程');
  await checkPort(8000, 'FastAPI');
  await checkPort(3000, 'Next.js');
  await checkPort(MONITORING_PORT, 'Monitoring');

  const uvicorn = path.join(VENV, 'bin', 'uvicorn');
  const celery  = path.join(VENV, 'bin', 'celery');
  const apiEnvPath = path.join(API_DIR, '.env');
  const apiEnvContent = fs.readFileSync(apiEnvPath, 'utf8');
  const envFromFile = Object.fromEntries(
    apiEnvContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
  const apiCorsOrigins = mergeOrigins(
    process.env.CORS_ORIGINS || envFromFile.CORS_ORIGINS || 'http://localhost:3000',
    MONITORING_ORIGIN
  );

  printAccessInfo();

  await runDevTUI([
    {
      name: 'api',
      label: 'Agent',
      command: uvicorn,
      args: ['app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'],
      cwd: API_DIR,
      env: {
        CORS_ORIGINS: apiCorsOrigins,
      },
    },
    {
      name: 'worker',
      label: 'Worker',
      command: celery,
      args: ['-A', 'app.workers.tasks.celery_app', 'worker', '--loglevel=info', '--concurrency=2', '-n', 'worker@%h'],
      cwd: API_DIR,
    },
    {
      name: 'beat',
      label: 'Beat',
      command: celery,
      args: ['-A', 'app.workers.tasks.celery_app', 'beat', '--loglevel=info'],
      cwd: API_DIR,
    },
    {
      name: 'web',
      label: 'Web',
      command: 'pnpm',
      args: ['dev'],
      cwd: WEB_DIR,
    },
    {
      name: 'monitoring',
      label: 'Monitoring',
      command: 'pnpm',
      args: ['dev', '--port', String(MONITORING_PORT)],
      cwd: MONITORING_DIR,
      env: {
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:8000/api/v1',
        MONITORING_BASE_PATH: '/ops',
      },
    },
  ]);
}
