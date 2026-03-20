import inquirer from 'inquirer';
import { section } from '../utils/ui.js';
import { exec } from '../utils/proc.js';
import { ROOT_DIR } from '../utils/paths.js';

export async function showLogs() {
  section('查看日志');

  const { choice } = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: '选择要查看的服务：',
    choices: [
      { name: '所有服务', value: '' },
      { name: 'API',      value: 'api' },
      { name: 'Worker',   value: 'worker' },
      { name: 'Web',      value: 'web' },
      { name: '数据库',   value: 'db' },
      { name: 'Redis',    value: 'redis' },
    ],
    default: '',
  }]);

  exec(`docker compose logs -f --tail=100 ${choice}`, { shell: true, cwd: ROOT_DIR });
}
