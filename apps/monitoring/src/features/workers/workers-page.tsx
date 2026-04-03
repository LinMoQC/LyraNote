"use client";

import { useQuery } from "@tanstack/react-query";

import { ProtectedView } from "@/components/protected-view";
import { WorkersTable } from "@/components/workers-table";
import { UnauthorizedError } from "@/lib/http-client";
import { getWorkers } from "@/services/monitoring-service";

export function WorkersPage() {
  const workersQuery = useQuery({
    queryKey: ["monitoring", "workers"],
    queryFn: () => getWorkers(),
  });

  return (
    <ProtectedView unauthorized={workersQuery.error instanceof UnauthorizedError}>
      <div className="flex h-full min-h-0 flex-col">
        {workersQuery.data ? <WorkersTable workers={workersQuery.data} /> : null}
      </div>
    </ProtectedView>
  );
}
