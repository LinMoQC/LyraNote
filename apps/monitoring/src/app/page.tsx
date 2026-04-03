import { AppShell } from "@/components/app-shell";
import { OverviewPage } from "@/features/dashboard/overview-page";

export default function HomePage() {
  return (
    <AppShell title="运行总览" subtitle="集中查看请求延迟、聊天成功率、最近故障以及 worker 健康。">
      <OverviewPage />
    </AppShell>
  );
}
