import { runDevTUI } from '../tui/runDevTUI.js';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { section, log, warn, info, printAccessInfo, waitTcp, tcpReady } from '../utils/ui.js';
import { checkCommand, checkPort, prompt, exec } from '../utils/proc.js';
import { ROOT_DIR, API_DIR, WEB_DIR } from '../utils/paths.js';

const VENV = path.join(API_DIR, '.venv');

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
  exec('pnpm install --silent', { shell: true, cwd: WEB_DIR, stdio: 'ignore' });
  s2.succeed('前端依赖已就绪');

  // ── 启动 TUI + 进程 ──
  section('启动应用进程');
  await checkPort(8000, 'FastAPI');
  await checkPort(3000, 'Next.js');

  const uvicorn = path.join(VENV, 'bin', 'uvicorn');
  const celery  = path.join(VENV, 'bin', 'celery');

  printAccessInfo();

  await runDevTUI([
    {
      name: 'api',
      label: 'FastAPI',
      command: uvicorn,
      args: ['app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'],
      cwd: API_DIR,
    },
    {
      name: 'worker',
      label: 'Worker',
      command: celery,
      args: ['-A', 'app.workers.tasks.celery_app', 'worker', '--loglevel=info', '--concurrency=2'],
      cwd: API_DIR,
    },
    {
      name: 'web',
      label: 'Next.js',
      command: 'pnpm',
      args: ['dev'],
      cwd: WEB_DIR,
    },
  ]);
}

