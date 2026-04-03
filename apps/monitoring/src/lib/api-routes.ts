export const AUTH = {
  LOGIN: "/auth/login",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
} as const;

export const MONITORING = {
  OVERVIEW: "/monitoring/overview",
  TRACES: "/monitoring/traces",
  traceDetail: (traceId: string) => `/monitoring/traces/${traceId}`,
  FAILURES: "/monitoring/failures",
  WORKERS: "/monitoring/workers",
  WORKLOADS: "/monitoring/workloads",
} as const;
