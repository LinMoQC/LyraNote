import inquirer from 'inquirer';
import chalk from 'chalk';
import { printBanner } from '../utils/ui.js';
import { startDocker, buildImages }   from './docker.js';
import { startLocal }                 from './local.js';
import { stopDocker }                 from './stop.js';
import { showLogs }                   from './logs.js';
import { showStatus }                 from './status.js';
import { initConfig }                 from './init.js';
import { startProd, updateProd }      from './prod.js';

const MENU_CHOICES = [
  {
    name: `${chalk.green('1')}  🐳  Docker 模式启动    ${chalk.dim('（推荐，一键启动全部服务）')}`,
    value: 'docker',
  },
  {
    name: `${chalk.green('2')}  💻  本地模式启动       ${chalk.dim('（本地调试，数据层用 Docker）')}`,
    value: 'local',
  },
  {
    name: `${chalk.green('3')}  🚀  生产模式启动       ${chalk.dim('（ghcr.io 云端镜像，服务器部署）')}`,
    value: 'prod',
  },
  {
    name: `${chalk.cyan('4')}  ⚙️   初始化配置向导     ${chalk.dim('（生成 .env，首次部署必须）')}`,
    value: 'init',
  },
  {
    name: `${chalk.yellow('5')}  📊  查看服务状态`,
    value: 'status',
  },
  {
    name: `${chalk.yellow('6')}  📋  查看日志`,
    value: 'logs',
  },
  {
    name: `${chalk.yellow('7')}  🔨  重新构建镜像`,
    value: 'build',
  },
  {
    name: `${chalk.yellow('8')}  🔄  一键更新           ${chalk.dim('（git pull + 拉新镜像 + 重启）')}`,
    value: 'update',
  },
  {
    name: `${chalk.red('9')}  ⏹   停止服务`,
    value: 'stop',
  },
  new inquirer.Separator(),
  {
    name: `${chalk.dim('0')}  ✕   退出`,
    value: 'exit',
  },
];

export async function interactiveMenu() {
  while (true) {
    console.clear();
    printBanner();

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: '请选择操作：',
      choices: MENU_CHOICES,
      pageSize: 12,
    }]);

    if (action === 'exit') {
      console.log('\n  ' + chalk.dim('再见！') + '\n');
      process.exit(0);
    }

    await dispatch(action);

    if (action !== 'local' && action !== 'logs') {
      await inquirer.prompt([{
        type: 'input',
        name: '_',
        message: chalk.dim('按 Enter 返回菜单...'),
      }]);
    }
  }
}

export async function dispatch(action) {
  switch (action) {
    case 'docker': await startDocker(); break;
    case 'local':  await startLocal();  break;
    case 'prod':   await startProd();   break;
    case 'init':   await initConfig();  break;
    case 'status': await showStatus();  break;
    case 'logs':   await showLogs();    break;
    case 'build':  await buildImages(); break;
    case 'update': await updateProd();  break;
    case 'stop':   await stopDocker();  break;
  }
}
