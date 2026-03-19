import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

const LOG_BUFFER = 300; // 每个服务保留最多 300 行日志

const SERVICE_COLORS = {
  api:    'cyan',
  worker: 'yellow',
  web:    'magenta',
};

const STATUS_COLORS = {
  starting: 'yellow',
  running:  'green',
  stopped:  'red',
  error:    'red',
};

const STATUS_ICONS = {
  starting: '◌',
  running:  '●',
  stopped:  '○',
  error:    '✘',
};

// ─── ServiceList（左栏）────────────────────────────────────────────────────────

function ServiceList({ services, activeIndex }) {
  return React.createElement(
    Box,
    { flexDirection: 'column', width: 18, borderStyle: 'round', borderColor: 'gray', paddingX: 1 },
    React.createElement(Text, { bold: true, color: 'white' }, ' Services'),
    React.createElement(Box, { height: 1 }),
    ...services.map((svc, i) => {
      const isActive = i === activeIndex;
      const color = SERVICE_COLORS[svc.name] || 'white';
      const statusColor = STATUS_COLORS[svc.status];
      const icon = STATUS_ICONS[svc.status];
      return React.createElement(
        Box,
        { key: svc.name, paddingX: 1, backgroundColor: isActive ? 'white' : undefined },
        React.createElement(
          Text,
          { color: isActive ? 'black' : color, bold: isActive },
          `${icon} ${svc.label}`
        )
      );
    }),
    React.createElement(Box, { flexGrow: 1 }),
    React.createElement(Text, { color: 'gray', dimColor: true }, '↑↓ switch')
  );
}

// ─── LogPane（右栏）────────────────────────────────────────────────────────────

function LogPane({ service, height }) {
  if (!service) return null;
  const color = SERVICE_COLORS[service.name] || 'white';
  const visibleLines = service.logs.slice(-Math.max(1, height - 4));

  return React.createElement(
    Box,
    { flexDirection: 'column', flexGrow: 1, borderStyle: 'round', borderColor: color, paddingX: 1 },
    React.createElement(
      Box,
      null,
      React.createElement(Text, { bold: true, color }, ` ${service.label} `),
      React.createElement(Text, { color: STATUS_COLORS[service.status] },
        `${STATUS_ICONS[service.status]} ${service.status}`
      ),
      service.pid
        ? React.createElement(Text, { color: 'gray', dimColor: true }, `  pid:${service.pid}`)
        : null
    ),
    React.createElement(Box, { height: 1 }),
    ...visibleLines.map((line, i) =>
      React.createElement(
        Text,
        { key: i, wrap: 'truncate-end' },
        line || ' '
      )
    )
  );
}

// ─── StatusBar（底部）──────────────────────────────────────────────────────────

function StatusBar({ services }) {
  return React.createElement(
    Box,
    { borderStyle: 'single', borderColor: 'gray', paddingX: 1 },
    ...services.map((svc) =>
      React.createElement(
        Box,
        { key: svc.name, marginRight: 3 },
        React.createElement(
          Text,
          { color: STATUS_COLORS[svc.status] },
          `${STATUS_ICONS[svc.status]} `
        ),
        React.createElement(Text, { color: SERVICE_COLORS[svc.name] || 'white' }, svc.label)
      )
    ),
    React.createElement(Box, { flexGrow: 1 }),
    React.createElement(Text, { color: 'gray', dimColor: true }, 'q quit')
  );
}

// ─── DevTUI（根组件）────────────────────────────────────────────────────────────

export function DevTUI({ initialServices, onQuit }) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 40;

  const [services, setServices] = useState(
    initialServices.map((svc) => ({
      ...svc,
      logs: [],
      status: 'starting',
      pid: null,
    }))
  );
  const [activeIndex, setActiveIndex] = useState(0);

  // 外部通过 ref 调用的更新接口
  useEffect(() => {
    // 挂载到 initialServices 携带的 callbacks
    initialServices.forEach((svc, i) => {
      svc._onLog = (line) => {
        setServices((prev) => {
          const next = [...prev];
          const s = { ...next[i] };
          s.logs = [...s.logs, line].slice(-LOG_BUFFER);
          next[i] = s;
          return next;
        });
      };
      svc._onStatus = (status, pid) => {
        setServices((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status, pid: pid ?? next[i].pid };
          return next;
        });
      };
    });
  }, []); // eslint-disable-line

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      onQuit?.();
      return;
    }
    if (key.upArrow) {
      setActiveIndex((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setActiveIndex((i) => Math.min(services.length - 1, i + 1));
    }
  });

  const logPaneHeight = termHeight - 3; // border only, no status bar

  return React.createElement(
    Box,
    { flexDirection: 'column', height: termHeight },
    React.createElement(
      Box,
      { flexGrow: 1 },
      React.createElement(ServiceList, { services, activeIndex }),
      React.createElement(LogPane, { service: services[activeIndex], height: logPaneHeight })
    )
  );
}
