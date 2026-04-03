import chalk from 'chalk';
import { section, tcpReady } from '../utils/ui.js';
import { execQ } from '../utils/proc.js';
const CONTAINERS = [
  'lyranote-api-1',
  'lyranote-worker-1',
  'lyranote-beat-1',
  'lyranote-web-1',
  'lyranote-monitoring-1',
  'lyranote-db-1',
  'lyranote-redis-1',
  'lyranote-minio-1',
];

const ENDPOINTS = [
  { name: '前端',       host: 'localhost', port: 3000 },
  { name: '监控面板',   host: 'localhost', port: 3100 },
  { name: 'API',        host: 'localhost', port: 8000 },
  { name: 'MinIO',      host: 'localhost', port: 9001 },
  { name: 'PostgreSQL', host: 'localhost', port: 5433 },
  { name: 'Redis',      host: 'localhost', port: 6379 },
];

export async function showStatus() {
  section('服务状态');
  console.log();

  // Docker 容器状态
  const hasDocker = !!execQ('command -v docker');
  if (hasDocker) {
    console.log(`  ${chalk.bold('容器')}${' '.repeat(24)}${chalk.bold('状态')}`);
    console.log('  ' + chalk.dim('─'.repeat(40)));
    for (const c of CONTAINERS) {
      const status = execQ(`docker inspect --format='{{.State.Status}}' ${c} 2>/dev/null`) || '未运行';
      const dot = status === 'running'
        ? chalk.green('● 运行中')
        : chalk.red(`○ ${status.padEnd(8)}`);
      console.log(`  ${c.padEnd(28)} ${dot}`);
    }
  } else {
    console.log(chalk.yellow('⚠  未安装 Docker，跳过容器状态检查'));
  }

  console.log();

  // 端口可达性
  console.log(`  ${chalk.bold('服务端点')}${' '.repeat(22)}${chalk.bold('可达性')}`);
  console.log('  ' + chalk.dim('─'.repeat(40)));
  for (const ep of ENDPOINTS) {
    const ok = await tcpReady(ep.host, ep.port);
    const label = `${ep.name} (${ep.host}:${ep.port})`.padEnd(28);
    const dot = ok ? chalk.green('● 可达') : chalk.dim('○ 不可达');
    console.log(`  ${label} ${dot}`);
  }
  console.log();
}
