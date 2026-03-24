"use client";

/**
 * @file 工作区全局效果挂载器
 * @description 在工作区布局中挂载全局 SSE 事件总线和活动心跳，
 *              作为 Client Component 桥接到 Server Component 的 layout。
 */

import { useActivityHeartbeat } from "@/hooks/use-activity-heartbeat";
import { useGlobalEvents } from "@/hooks/use-global-events";

export function WorkspaceEffects() {
  useActivityHeartbeat();
  useGlobalEvents();
  return null;
}
