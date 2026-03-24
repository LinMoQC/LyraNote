import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronRight,
  Globe,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Zap,
} from "lucide-react";
import { useUiStore } from "@/store/use-ui-store";
import { getHttpClient } from "@/lib/http-client";
import { createNotebookService } from "@lyranote/api-client";
import type { Notebook } from "@lyranote/types";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const {
    selectedNotebookId,
    isSidebarCollapsed,
    activeView,
    selectNotebook,
    toggleSidebar,
    setActiveView,
  } = useUiStore();

  const notebookService = createNotebookService(getHttpClient());

  const { data: notebooks = [] } = useQuery({
    queryKey: ["notebooks"],
    queryFn: () => notebookService.getNotebooks(),
  });

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar-bg border-r border-sidebar-border transition-all duration-200 shrink-0",
        isSidebarCollapsed ? "w-12" : "w-56"
      )}
    >
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-2 py-2 h-10">
        {!isSidebarCollapsed && (
          <span className="text-xs font-semibold text-sidebar-text-muted tracking-widest uppercase pl-1">
            Notebooks
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded hover:bg-sidebar-hover text-sidebar-text-muted hover:text-sidebar-text transition-colors ml-auto"
        >
          {isSidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* 笔记本列表 */}
      <div className="flex-1 overflow-y-auto py-1 min-h-0">
        {!isSidebarCollapsed && (
          <>
            {notebooks.map((nb) => (
              <NotebookItem
                key={nb.id}
                notebook={nb}
                isSelected={nb.id === selectedNotebookId}
                onSelect={() => selectNotebook(nb.id)}
              />
            ))}
            <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sidebar-text-muted hover:text-sidebar-text hover:bg-sidebar-hover rounded mx-1 transition-colors">
              <Plus size={13} />
              <span className="text-xs">New notebook</span>
            </button>
          </>
        )}
      </div>

      {/* 底部导航 */}
      <div className="border-t border-sidebar-border py-1">
        <NavItem
          icon={<Globe size={15} />}
          label="Knowledge"
          collapsed={isSidebarCollapsed}
          active={activeView === "knowledge"}
          onClick={() => setActiveView("knowledge")}
        />
        <NavItem
          icon={<Zap size={15} />}
          label="Tasks"
          collapsed={isSidebarCollapsed}
          active={activeView === "tasks"}
          onClick={() => setActiveView("tasks")}
        />
        <NavItem
          icon={<Settings size={15} />}
          label="Settings"
          collapsed={isSidebarCollapsed}
          onClick={() => {}}
        />
      </div>
    </aside>
  );
}

function NotebookItem({
  notebook,
  isSelected,
  onSelect,
}: {
  notebook: Notebook;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 rounded mx-1 transition-colors text-left group",
        isSelected
          ? "bg-sidebar-active text-sidebar-text"
          : "text-sidebar-text-muted hover:bg-sidebar-hover hover:text-sidebar-text"
      )}
    >
      <span className="text-base leading-none shrink-0">
        {notebook.coverEmoji ?? "📓"}
      </span>
      <span className="text-xs font-medium truncate flex-1">{notebook.title}</span>
      {isSelected && <ChevronRight size={11} className="shrink-0 opacity-50" />}
    </button>
  );
}

function NavItem({
  icon,
  label,
  collapsed,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 rounded mx-1 transition-colors",
        active
          ? "bg-sidebar-active text-sidebar-text"
          : "text-sidebar-text-muted hover:bg-sidebar-hover hover:text-sidebar-text"
      )}
    >
      {icon}
      {!collapsed && <span className="text-xs font-medium">{label}</span>}
    </button>
  );
}
