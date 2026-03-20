import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// scripts/lyra-cli/src/utils/ → ../../../../ = 项目根
export const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..');
export const API_DIR  = path.join(ROOT_DIR, 'api');
export const WEB_DIR  = path.join(ROOT_DIR, 'web');
