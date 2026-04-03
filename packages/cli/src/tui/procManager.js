import { spawn } from 'child_process';
import { stripVTControlCharacters } from 'util';

/**
 * 启动一组服务，把输出推给 TUI 的 _onLog / _onStatus callbacks。
 *
 * @param {Array<{ name, command, args, cwd, env, _onLog, _onStatus }>} services
 * @returns {{ kill: () => void }}
 */
export function startServices(services) {
  const procs = [];
  const supportsProcessGroups = process.platform !== 'win32';

  for (const svc of services) {
    const proc = spawn(svc.command, svc.args ?? [], {
      cwd: svc.cwd,
      env: { ...process.env, ...(svc.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: supportsProcessGroups,
    });

    procs.push(proc);
    svc._onStatus?.('running', proc.pid);

    const pushLine = (raw) => {
      const text = stripVTControlCharacters(String(raw));
      text.split('\n').forEach((line) => {
        if (line.trim()) svc._onLog?.(line);
      });
    };

    proc.stdout.on('data', pushLine);
    proc.stderr.on('data', pushLine);

    proc.on('close', (code) => {
      svc._onLog?.(`─── process exited (code ${code}) ───`);
      svc._onStatus?.(code === 0 ? 'stopped' : 'error');
    });

    proc.on('error', (err) => {
      svc._onLog?.(`✘ ${err.message}`);
      svc._onStatus?.('error');
    });
  }

  return {
    kill() {
      procs.forEach((p) => {
        try {
          if (supportsProcessGroups && p.pid) {
            process.kill(-p.pid, 'SIGTERM');
          } else {
            p.kill('SIGTERM');
          }
        } catch { /* ignore */ }

        setTimeout(() => {
          try {
            if (p.exitCode !== null || p.signalCode !== null || p.killed) return;
            if (supportsProcessGroups && p.pid) {
              process.kill(-p.pid, 'SIGKILL');
            } else {
              p.kill('SIGKILL');
            }
          } catch { /* ignore */ }
        }, 1500);
      });
    },
  };
}
