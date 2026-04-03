import { AppShell } from "@/components/app-shell";
import { TraceDetailPage } from "@/features/traces/trace-detail-page";

export default async function TraceDetailRoute({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;

  return (
    <AppShell title="Trace 详情" subtitle="查看单条链路下的 run 和 span 执行顺序。">
      <TraceDetailPage traceId={traceId} />
    </AppShell>
  );
}
