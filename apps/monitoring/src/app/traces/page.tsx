import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { TracesPage } from "@/features/traces/traces-page";

export default function TracesRoute() {
  return (
    <AppShell title="链路追踪" subtitle="查询顶层 run，并跳转到单条 trace 的 span 时间线。">
      <Suspense fallback={<div className="rounded-3xl border border-border bg-card/80 p-8 text-sm text-muted">正在加载筛选条件...</div>}>
        <TracesPage />
      </Suspense>
    </AppShell>
  );
}
