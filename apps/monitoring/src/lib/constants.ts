export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
export const MONITORING_BASE_PATH =
  process.env.NEXT_PUBLIC_MONITORING_BASE_PATH ?? "/ops";
export const HOME_ROUTE = "/";
export const LOGIN_ROUTE = "/login";
export const TRACES_ROUTE = "/traces";
export const FAILURES_ROUTE = "/failures";
export const WORKLOADS_ROUTE = "/workloads";
export const WORKERS_ROUTE = "/workers";
export const LOGIN_PATH = `${MONITORING_BASE_PATH}${LOGIN_ROUTE}`;
