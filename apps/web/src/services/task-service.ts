import { http } from "@/lib/http-client";
import { TASKS } from "@/lib/api-routes";

/**
 * @file 定时任务管理服务
 * @description 提供定时任务（如定期报告生成）的增删改查、手动执行和运行历史查询接口。
 */

/** 定时任务完整数据结构 */
export type ScheduledTask = {
  id: string;
  name: string;
  description: string | null;
  task_type: string;
  schedule_cron: string;
  timezone: string;
  parameters: Record<string, unknown>;
  delivery_config: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  run_count: number;
  last_result: string | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
};

/** 任务单次运行记录 */
export type TaskRun = {
  id: string;
  task_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  result_summary: string | null;
  error_message: string | null;
  generated_content: string | null;
  sources_count: number;
  delivery_status: Record<string, unknown> | null;
};

/** 创建定时任务的输入参数 */
export type TaskCreateInput = {
  name: string;
  topic: string;
  schedule?: string;
  delivery?: string;
  email?: string;
  notebook_id?: string;
  article_style?: string;
  language?: string;
  feed_urls?: string[];
};

/**
 * 创建新的定时任务
 * @param input - 任务配置参数
 * @returns 创建成功的任务对象
 */
export async function createTask(input: TaskCreateInput): Promise<ScheduledTask> {
  return http.post<ScheduledTask>(TASKS.LIST, input);
}

/**
 * 获取所有定时任务列表
 * @returns 任务数组
 */
export async function getTasks(): Promise<ScheduledTask[]> {
  return http.get<ScheduledTask[]>(TASKS.LIST);
}

/**
 * 获取单个定时任务详情
 * @param taskId - 任务 ID
 * @returns 任务对象
 */
export async function getTask(taskId: string): Promise<ScheduledTask> {
  return http.get<ScheduledTask>(`/tasks/${taskId}`);
}

/**
 * 更新定时任务配置
 * @param taskId - 任务 ID
 * @param updates - 需要更新的字段
 * @returns 更新后的任务对象
 */
export async function updateTask(
  taskId: string,
  updates: Partial<Pick<ScheduledTask, "name" | "schedule_cron" | "parameters" | "delivery_config" | "enabled">>
): Promise<ScheduledTask> {
  return http.patch<ScheduledTask>(TASKS.detail(taskId), updates);
}

/**
 * 删除定时任务
 * @param taskId - 任务 ID
 */
export async function deleteTask(taskId: string): Promise<void> {
  await http.delete(TASKS.detail(taskId));
}

/**
 * 手动触发任务执行（不等待 cron 调度）
 * @param taskId - 任务 ID
 * @returns 触发结果状态
 */
export async function runTaskManually(
  taskId: string
): Promise<{ status: string; message: string }> {
  return http.post<{ status: string; message: string }>(TASKS.run(taskId));
}

/**
 * 获取任务的历史运行记录
 * @param taskId - 任务 ID
 * @returns 运行记录数组
 */
export async function getTaskRuns(taskId: string): Promise<TaskRun[]> {
  return http.get<TaskRun[]>(TASKS.runs(taskId));
}
