import React from 'react';
import { render } from 'ink';
import { DevTUI } from './DevTUI.js';
import { startServices } from './procManager.js';

/**
 * 启动 ink TUI，并同时启动所有服务进程。
 *
 * @param {Array<{ name, label, command, args, cwd }>} serviceDefs
 */
export async function runDevTUI(serviceDefs) {
  // 把 serviceDefs 作为 initialServices 传给 TUI
  // TUI 挂载后会往每个 def 上写 _onLog / _onStatus
  const defs = serviceDefs.map((d) => ({ ...d }));

  let manager;

  const { waitUntilExit, unmount } = render(
    React.createElement(DevTUI, {
      initialServices: defs,
      onQuit: () => {
        manager?.kill();
        unmount();
      },
    }),
    { exitOnCtrlC: false }
  );

  // ink 渲染是同步挂载的，但 useEffect 在下一 tick 才执行，
  // 等一个 tick 确保 _onLog / _onStatus 已被注册
  await new Promise((r) => setTimeout(r, 50));

  manager = startServices(defs);

  // Ctrl+C 时也清理
  process.on('SIGINT', () => {
    manager?.kill();
    unmount();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    manager?.kill();
    unmount();
    process.exit(0);
  });

  await waitUntilExit();
}
