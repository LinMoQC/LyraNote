/**
 * @file 自定义无边框标题栏
 * @description 适配 macOS（traffic lights 左侧）和 Windows（控制按钮右侧）的无边框窗口标题栏。
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(async () => {
      setIsMaximized(await appWindow.isMaximized());
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [appWindow]);

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-8 px-3 select-none shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* macOS traffic light 占位（系统会自动渲染，留出空间） */}
      <div className="w-16" />

      {/* 应用名 */}
      <span className="text-xs font-medium text-white/30 tracking-wide">
        LyraNote
      </span>

      {/* Windows 控制按钮区（macOS 系统自动处理，隐藏） */}
      <div
        className="flex items-center gap-1 window-controls"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <WindowButton
          onClick={() => appWindow.minimize()}
          title="Minimize"
          icon={<MinimizeIcon />}
        />
        <WindowButton
          onClick={() => (isMaximized ? appWindow.unmaximize() : appWindow.maximize())}
          title={isMaximized ? "Restore" : "Maximize"}
          icon={isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        />
        <WindowButton
          onClick={() => appWindow.close()}
          title="Close"
          icon={<CloseIcon />}
          danger
        />
      </div>
    </div>
  );
}

function WindowButton({
  onClick,
  title,
  icon,
  danger,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-5 flex items-center justify-center rounded text-white/40 transition-colors
        ${danger ? "hover:bg-red-500/80 hover:text-white" : "hover:bg-white/10 hover:text-white/80"}`}
    >
      {icon}
    </button>
  );
}

const MinimizeIcon = () => (
  <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
    <rect width="10" height="1" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="0.5" y="0.5" width="8" height="8" />
  </svg>
);

const RestoreIcon = () => (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="2.5" y="0.5" width="6" height="6" />
    <path d="M0.5 2.5v6h6" />
  </svg>
);

const CloseIcon = () => (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M0.5 0.5L8.5 8.5M8.5 0.5L0.5 8.5" />
  </svg>
);
