import chalk from 'chalk';
import net from 'net';

// ─── 输出工具 ─────────────────────────────────────────────────────────────────

export const log     = (...a) => console.log(chalk.green('✔'), ...a);
export const warn    = (...a) => console.warn(chalk.yellow('⚠ '), ...a);
export const error   = (...a) => { console.error(chalk.red('✘ '), ...a); process.exit(1); };
export const info    = (...a) => console.log(chalk.cyan('ℹ '), ...a);
export const section = (t)    => console.log('\n' + chalk.bold.cyan(`── ${t} ──`));
export const dim     = (...a) => console.log(chalk.dim(...a));

export function printBanner() {
  console.log(chalk.bold.cyan([
    '',
    '  ██╗  ██╗   ██╗██████╗  █████╗ ███╗   ██╗ ██████╗ ████████╗███████╗',
    '  ██║  ╚██╗ ██╔╝██╔══██╗██╔══██╗████╗  ██║██╔═══██╗╚══██╔══╝██╔════╝',
    '  ██║   ╚████╔╝ ██████╔╝███████║██╔██╗ ██║██║   ██║   ██║   █████╗  ',
    '  ██║    ╚██╔╝  ██╔══██╗██╔══██║██║╚██╗██║██║   ██║   ██║   ██╔══╝  ',
    '  ███████╗██║   ██║  ██║██║  ██║██║ ╚████║╚██████╔╝   ██║   ███████╗',
    '  ╚══════╝╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ╚══════╝',
    '',
  ].join('\n')));
  console.log('  ' + chalk.dim('AI 驱动的笔记与知识管理系统') + '\n');
}

export function printAccessInfo() {
  console.log();
  console.log('  ' + chalk.bold.green('🎉 启动成功！'));
  console.log();
  console.log('  ' + chalk.bold('前端应用   ') + chalk.cyan('http://localhost:3000'));
  console.log('  ' + chalk.bold('API 服务   ') + chalk.cyan('http://localhost:8000'));
  console.log('  ' + chalk.bold('API 文档   ') + chalk.cyan('http://localhost:8000/docs'));
  console.log('  ' + chalk.bold('MinIO 控制台') + ' ' + chalk.cyan('http://localhost:9001') + '  ' + chalk.dim('(lyranote / lyranote123)'));
  console.log();
  console.log('  ' + chalk.dim('查看日志：lyra logs    停止服务：lyra stop'));
  console.log();
}

// ─── 网络工具 ─────────────────────────────────────────────────────────────────

export function tcpReady(host, port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port, timeout: 500 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error',   () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

export async function waitTcp(host, port, name, retries = 25) {
  for (let i = 1; i <= retries; i++) {
    if (await tcpReady(host, port)) {
      log(`${name} 已就绪 (${host}:${port})`);
      return;
    }
    process.stdout.write(`\r  ${chalk.dim(`等待 ${name}...`)} ${i}s`);
    await sleep(1000);
  }
  process.stdout.write('\n');
  error(`${name} 在 ${host}:${port} 启动超时`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
