import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProdUpdateDirtyWorktreeGuidance,
  parseTrackedFilesFromGitStatus,
} from './prod.js';

test('parseTrackedFilesFromGitStatus ignores untracked files', () => {
  const status = [
    ' M pnpm-lock.yaml',
    'A  packages/cli/src/commands/prod.test.js',
    '?? apps/api/tmp/debug.log',
  ].join('\n');

  assert.deepEqual(parseTrackedFilesFromGitStatus(status), [
    'pnpm-lock.yaml',
    'packages/cli/src/commands/prod.test.js',
  ]);
});

test('buildProdUpdateDirtyWorktreeGuidance lists files and recovery steps', () => {
  const lines = buildProdUpdateDirtyWorktreeGuidance([
    'pnpm-lock.yaml',
    'packages/cli/src/commands/prod.js',
  ]);

  assert.equal(lines[0], '检测到本地未提交的 Git 改动，已停止更新以避免覆盖这些文件：');
  assert.equal(lines[1], '- pnpm-lock.yaml');
  assert.equal(lines[2], '- packages/cli/src/commands/prod.js');
  assert.ok(lines.includes('如果这些改动不需要保留，请先执行：git restore <文件>'));
  assert.ok(lines.includes('如果这些改动需要暂存，请先执行：git stash push --include-untracked'));
  assert.equal(lines.at(-1), '清理完成后，再重新运行 lyra update。');
});
