import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { FailuresPage } from "@/features/failures/failures-page";

export default function FailuresRoute() {
  return (
    <AppShell title="失败事件" subtitle="聚合最近失败的聊天、研究、定时任务与来源导入。">
      <Suspense fallback={<div className="rounded-3xl border border-border bg-card/80 p-8 text-sm text-muted">正在加载筛选条件...</div>}>
        <FailuresPage />
      </Suspense>
    </AppShell>
  );
}
