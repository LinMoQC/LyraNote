import { execSync, spawn } from 'child_process';
import { error, warn, info, log } from './ui.js';
import readline from 'readline';

/**
 * 检查命令是否存在，不存在则 exit(1)
 */
export function checkCommand(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
  } catch {
    error(`'${cmd}' 未安装，请先安装后重试。`);
  }
}

/**
 * 检查端口是否被占用，被占用时交互式询问是否终止
 */
export async function checkPort(port, name) {
  let pid;
  try {
    const out = execSync(
      `lsof -i :${port} -sTCP:LISTEN -t 2>/dev/null | head -1`,
      { encoding: 'utf8' }
    ).trim();
    pid = out || null;
  } catch {
    pid = null;
  }
  if (!pid) return;

  let pname = 'unknown';
  try {
    pname = execSync(`ps -p ${pid} -o comm= 2>/dev/null`, { encoding: 'utf8' }).trim();
  } catch { /* ignore */ }

  warn(`${name} 端口 ${port} 被占用 (PID ${pid} - ${pname})`);
  const ans = await prompt('  是否终止该进程？[y/N] ');
  if (/^[Yy]$/.test(ans.trim())) {
    try {
      execSync(`kill -9 ${pid}`);
      log(`已终止 PID ${pid}`);
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      error(`无法终止 PID ${pid}`);
    }
  } else {
    error(`端口 ${port} 被占用，无法启动 ${name}`);
  }
}

/**
 * 简单 readline prompt
 */
export function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => { rl.close(); resolve(ans); });
  });
}

/**
 * 用 spawn 运行命令，继承 stdio，返回 Promise<exitCode>
 */
export function run(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const cp = spawn(cmd, args, { stdio: 'inherit', shell: false, ...opts });
    cp.on('close', resolve);
    cp.on('error', reject);
  });
}

/**
 * 后台运行，返回 ChildProcess
 */
export function runBg(cmd, args = [], opts = {}) {
  return spawn(cmd, args, { stdio: 'inherit', shell: false, detached: false, ...opts });
}

/**
 * execSync 包装，输出到终端
 */
export function exec(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', encoding: 'utf8', ...opts });
}

/**
 * execSync 静默，返回 stdout
 */
export function execQ(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}
