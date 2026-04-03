import { AppShell } from "@/components/app-shell";
import { WorkersPage } from "@/features/workers/workers-page";

export default function WorkersRoute() {
  return (
    <AppShell title="Worker 健康" subtitle="查看 API、worker 与 beat 的心跳状态，快速识别 stale / down 实例。">
      <WorkersPage />
    </AppShell>
  );
}
