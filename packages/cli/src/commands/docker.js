import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { section, log, warn, error, info, printAccessInfo, waitTcp, tcpReady, sleep } from '../utils/ui.js';
import { checkCommand, checkPort, prompt, exec, execQ } from '../utils/proc.js';
import { ROOT_DIR, API_DIR } from '../utils/paths.js';

// ─── .env 检查 ────────────────────────────────────────────────────────────────

async function ensureEnv() {
  const envFile = path.join(API_DIR, '.env');
  if (!fs.existsSync(envFile)) {
    warn('api/.env 不存在，从 .env.example 复制...');
    fs.copyFileSync(path.join(API_DIR, '.env.example'), envFile);
    console.log();
    warn(`请先编辑 ${envFile}，填入 OPENAI_API_KEY 等配置后重新运行。`);
    console.log();
    const ans = await prompt('  现在用编辑器打开？[Y/n] ');
    if (/^[Nn]$/.test(ans.trim())) process.exit(1);
    exec(`${process.env.EDITOR || 'vi'} "${envFile}"`, { shell: true });
  }

  const envContent = fs.readFileSync(envFile, 'utf8');
  if (/OPENAI_API_KEY=(sk-\.\.\.|)\s*$/.test(envContent)) {
    warn('OPENAI_API_KEY 未填写，AI 功能将无法使用。');
    console.log();
    const ans = await prompt('  继续启动？[Y/n] ');
    if (/^[Nn]$/.test(ans.trim())) process.exit(0);
  }
}

// ─── docker start ─────────────────────────────────────────────────────────────

export async function startDocker() {
  section('Docker Compose 模式');
  checkCommand('docker');
  await ensureEnv();

  await checkPort(8000, 'API');
  await checkPort(3000, 'Web');

  process.chdir(ROOT_DIR);

  let spinner = ora('构建镜像（仅变化时重建）...').start();
  try {
    exec('docker compose build --quiet', { shell: true, stdio: 'ignore' });
    spinner.succeed('镜像构建完成');
  } catch {
    spinner.fail('镜像构建失败');
    process.exit(1);
  }

  spinner = ora('启动服务...').start();
  try {
    exec('docker compose up -d', { shell: true, stdio: 'ignore' });
    spinner.succeed('容器已启动');
  } catch {
    spinner.fail('容器启动失败');
    process.exit(1);
  }

  section('等待服务就绪');

  spinner = ora('等待数据库...').start();
  for (let i = 1; i <= 30; i++) {
    try {
      exec('docker compose exec -T db pg_isready -U lyranote', { shell: true, stdio: 'ignore' });
      spinner.succeed('数据库已就绪');
      break;
    } catch { /* continue */ }
    if (i === 30) { spinner.fail('数据库启动超时'); process.exit(1); }
    await sleep(1000);
  }

  spinner = ora('等待 API...').start();
  for (let i = 1; i <= 30; i++) {
    try {
      exec('curl -sf http://localhost:8000/health', { shell: true, stdio: 'ignore' });
      spinner.succeed('API 已就绪');
      break;
    } catch { /* continue */ }
    if (i === 30) { spinner.fail('API 启动超时'); process.exit(1); }
    await sleep(2000);
  }

  printAccessInfo();
}

// ─── build ────────────────────────────────────────────────────────────────────

export async function buildImages() {
  section('重新构建镜像');
  checkCommand('docker');
  process.chdir(ROOT_DIR);
  const spinner = ora('正在构建...').start();
  try {
    exec('docker compose build', { shell: true });
    spinner.succeed('镜像构建完成');
  } catch {
    spinner.fail('构建失败');
    process.exit(1);
  }
}
