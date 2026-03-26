import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { section, log, warn, info } from '../utils/ui.js';
import { ROOT_DIR } from '../utils/paths.js';

function randomHex(n) {
  try {
    return execSync(`openssl rand -hex ${n}`, { encoding: 'utf8' }).trim();
  } catch {
    return `lyranote_${Date.now()}`;
  }
}

export async function initConfig() {
  section('LyraNote 初始化向导');
  console.log('  生成根目录 .env 文件（生产模式所用配置）\n');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'frontendUrl',
      message: '前端域名 (e.g. https://lyra.example.com)',
      default: 'https://your-domain.com',
    },
    {
      type: 'input',
      name: 'apiUrl',
      message: 'API 域名（留空与前端相同）',
      default: '',
    },
    {
      type: 'password',
      name: 'pgPass',
      message: 'PostgreSQL 密码（留空自动生成）',
      mask: '*',
    },
    {
      type: 'password',
      name: 'minioPass',
      message: 'MinIO 密码（留空自动生成）',
      mask: '*',
    },
    {
      type: 'input',
      name: 'googleId',
      message: 'Google Client ID（留空跳过）',
      default: '',
    },
    {
      type: 'password',
      name: 'googleSecret',
      message: 'Google Client Secret',
      mask: '*',
    },
    {
      type: 'input',
      name: 'githubId',
      message: 'GitHub Client ID（留空跳过）',
      default: '',
    },
    {
      type: 'password',
      name: 'githubSecret',
      message: 'GitHub Client Secret',
      mask: '*',
    },
  ]);

  const pgPass      = answers.pgPass      || randomHex(16);
  const minioPass   = answers.minioPass   || randomHex(16);
  const jwtSecret   = randomHex(32);
  const appBaseUrl  = answers.apiUrl      || answers.frontendUrl;

  info(`自动生成 JWT_SECRET: ${jwtSecret.slice(0, 16)}...`);

  const envContent = `# 由 lyra init 生成 ${new Date().toLocaleString()}

POSTGRES_PASSWORD=${pgPass}

MINIO_ROOT_USER=lyranote
MINIO_ROOT_PASSWORD=${minioPass}

APP_BASE_URL=${appBaseUrl}
FRONTEND_URL=${answers.frontendUrl}
CORS_ORIGINS=${answers.frontendUrl}

JWT_SECRET=${jwtSecret}
JWT_EXPIRE_DAYS=30

GOOGLE_CLIENT_ID=${answers.googleId}
GOOGLE_CLIENT_SECRET=${answers.googleSecret}
GITHUB_CLIENT_ID=${answers.githubId}
GITHUB_CLIENT_SECRET=${answers.githubSecret}

MEMORY_MODE=server
DEBUG=false
API_PREFIX=/api/v1
# 浏览器内请求 API 的根路径（须与上方 API 公网地址一致；写进 Next 客户端包，改后需重新构建 web 镜像）
NEXT_PUBLIC_API_BASE_URL=${appBaseUrl}/api/v1
`;

  const envPath = path.join(ROOT_DIR, '.env');
  fs.writeFileSync(envPath, envContent, 'utf8');
  log(`生产环境变量已写入 ${envPath}`);
  console.log('\n  下一步：' + chalk.cyan('lyra prod') + '  启动生产环境\n');
}
