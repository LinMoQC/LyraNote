import { TitleBar } from "@/components/titlebar/title-bar";
import { Sidebar } from "@/components/sidebar/sidebar";
import { AiPanel } from "@/components/ai-panel/ai-panel";
import { useUiStore } from "@/store/use-ui-store";
import { NotesPage } from "@/pages/notes";
import { KnowledgePage } from "@/pages/knowledge";
import { TasksPage } from "@/pages/tasks";

export function MainLayout() {
  const { activeView } = useUiStore();

  return (
    <div className="flex flex-col h-full bg-sidebar-bg">
      {/* 无边框标题栏 */}
      <TitleBar />

      {/* 主体：三栏布局 */}
      <div className="flex flex-1 min-h-0">
        {/* 左栏：导航侧边栏 */}
        <Sidebar />

        {/* 中栏：主内容区 */}
        <main className="flex-1 min-w-0 bg-surface overflow-hidden">
          {activeView === "notes" && <NotesPage />}
          {activeView === "knowledge" && <KnowledgePage />}
          {activeView === "tasks" && <TasksPage />}
        </main>

        {/* 右栏：AI 面板 */}
        <AiPanel />
      </div>
    </div>
  );
}
