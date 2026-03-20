#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { interactiveMenu, dispatch } from '../src/commands/menu.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('lyra')
  .description('LyraNote 项目管理 CLI')
  .version(pkg.version)
  // 无子命令时进入交互式菜单
  .action(async () => {
    await interactiveMenu();
  });

program
  .command('docker')
  .description('Docker Compose 一键启动（推荐）')
  .action(() => dispatch('docker'));

program
  .command('local')
  .description('本地开发模式（应用层本地 + 数据层 Docker）')
  .action(() => dispatch('local'));

program
  .command('dev')
  .description('本地开发模式（local 的别名）')
  .action(() => dispatch('local'));

program
  .command('prod')
  .description('生产模式启动（ghcr.io 云端镜像）')
  .action(() => dispatch('prod'));

program
  .command('init')
  .description('初始化配置向导，生成根目录 .env')
  .action(() => dispatch('init'));

program
  .command('status')
  .alias('st')
  .description('查看服务运行状态')
  .action(() => dispatch('status'));

program
  .command('logs')
  .description('查看 Docker Compose 日志')
  .action(() => dispatch('logs'));

program
  .command('build')
  .description('重新构建 Docker 镜像')
  .action(() => dispatch('build'));

program
  .command('update')
  .description('一键更新（git pull + 拉新镜像 + 重启）')
  .action(() => dispatch('update'));

program
  .command('stop')
  .description('停止 Docker Compose 服务')
  .action(() => dispatch('stop'));

// 全局错误捕获
process.on('uncaughtException', (err) => {
  console.error('\n' + '✘  ' + err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('\n' + '✘  ' + (err?.message ?? err));
  if (process.env.DEBUG) console.error(err?.stack);
  process.exit(1);
});

program.parse();
