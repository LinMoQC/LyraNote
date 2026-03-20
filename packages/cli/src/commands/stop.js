import inquirer from 'inquirer';
import chalk from 'chalk';
import { section, log, info, warn } from '../utils/ui.js';
import { exec } from '../utils/proc.js';
import { ROOT_DIR } from '../utils/paths.js';

function stopCompose(cmd) {
  try { exec(`docker compose ${cmd}`, { shell: true, cwd: ROOT_DIR }); } catch { /* ignore */ }
  try { exec(`docker compose -f docker-compose.prod.yml ${cmd}`, { shell: true, cwd: ROOT_DIR }); } catch { /* ignore */ }
}

export async function stopDocker() {
  section('停止 Docker Compose 服务');

  const { choice } = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: '选择停止方式：',
    choices: [
      { name: '停止容器（保留数据）',                          value: '1' },
      { name: '停止并删除容器（保留 volume 数据）',             value: '2' },
      { name: chalk.red('停止并清除所有数据（不可恢复）'),       value: '3' },
      { name: '取消',                                          value: '0' },
    ],
    default: '1',
  }]);

  switch (choice) {
    case '1': stopCompose('stop');  log('服务已停止（数据保留）'); break;
    case '2': stopCompose('down');  log('容器已删除（volume 保留）'); break;
    case '3': {
      const { confirm } = await inquirer.prompt([{
        type: 'input',
        name: 'confirm',
        message: chalk.red("确认清除所有数据？输入 'yes' 确认："),
      }]);
      if (confirm === 'yes') {
        stopCompose('down -v --remove-orphans');
        log('所有容器和数据已清除');
      } else {
        info('已取消');
      }
      break;
    }
    case '0': info('已取消'); break;
  }
}
