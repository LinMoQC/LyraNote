import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { WorkloadsPage } from "@/features/workloads/workloads-page";

export default function WorkloadsRoute() {
  return (
    <AppShell title="任务视图" subtitle="追踪消息生成、研究任务和定时任务的运行中、卡住与失败数量。">
      <Suspense fallback={<div className="rounded-3xl border border-border bg-card/80 p-8 text-sm text-muted">正在加载筛选条件...</div>}>
        <WorkloadsPage />
      </Suspense>
    </AppShell>
  );
}
