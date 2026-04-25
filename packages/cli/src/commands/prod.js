import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { section, warn, info } from '../utils/ui.js';
import { exec, execQ } from '../utils/proc.js';
import { ROOT_DIR } from '../utils/paths.js';

export function parseTrackedFilesFromGitStatus(statusOutput) {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !line.startsWith('?? '))
    .map((line) => line.slice(3));
}

export function buildProdUpdateDirtyWorktreeGuidance(files) {
  const visibleFiles = files.slice(0, 10);
  const lines = [
    '检测到本地未提交的 Git 改动，已停止更新以避免覆盖这些文件：',
    ...visibleFiles.map((file) => `- ${file}`),
  ];

  if (files.length > visibleFiles.length) {
    lines.push(`- 以及另外 ${files.length - visibleFiles.length} 个文件`);
  }

  lines.push('如果这些改动不需要保留，请先执行：git restore <文件>');
  lines.push('如果这些改动需要暂存，请先执行：git stash push --include-untracked');
  lines.push('清理完成后，再重新运行 lyra update。');

  return lines;
}

export async function startProd() {
  section('生产模式启动（ghcr.io 云端镜像）');

  const envFile = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envFile)) {
    warn('.env 不存在，请先运行 lyra init 进行初始化配置。');
    process.exit(1);
  }

  process.chdir(ROOT_DIR);

  let spinner = ora('拉取最新镜像...').start();
  try {
    exec('docker compose -f docker-compose.prod.yml pull', { shell: true });
    spinner.succeed('镜像拉取完成');
  } catch {
    spinner.fail('镜像拉取失败');
    process.exit(1);
  }

  spinner = ora('启动生产环境...').start();
  try {
    exec('docker compose -f docker-compose.prod.yml up -d', { shell: true });
    spinner.succeed('生产环境已启动');
  } catch {
    spinner.fail('启动失败');
    process.exit(1);
  }
}

export async function updateProd() {
  section('一键更新（git pull + 拉新镜像 + 重启）');
  process.chdir(ROOT_DIR);

  const dirtyTrackedFiles = parseTrackedFilesFromGitStatus(execQ('git status --porcelain'));
  if (dirtyTrackedFiles.length > 0) {
    warn('检测到本地改动，已取消本次更新。');
    for (const line of buildProdUpdateDirtyWorktreeGuidance(dirtyTrackedFiles)) {
      info(line);
    }
    process.exit(1);
  }

  const spinner = ora('更新到最新版本...').start();
  try {
    exec('git pull --ff-only', { shell: true });
    exec('docker compose -f docker-compose.prod.yml pull web api worker', { shell: true });
    exec('docker compose -f docker-compose.prod.yml up -d', { shell: true });
    exec('docker image prune -f', { shell: true });
    spinner.succeed('更新完成');
  } catch {
    spinner.fail('更新失败');
    process.exit(1);
  }
}
