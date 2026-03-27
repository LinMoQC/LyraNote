import type { TaskRun } from "@/services/task-service";

export type DeliveryBadgeTone = "success" | "error" | "muted";

export type DeliveryBadge = {
  key: string;
  tone: DeliveryBadgeTone;
  detail?: string;
};

export function getTaskDeliveryBadges(
  deliveryStatus: TaskRun["delivery_status"],
): DeliveryBadge[] {
  if (!deliveryStatus) return [];

  const badges: DeliveryBadge[] = [];
  const emailStatus = deliveryStatus.email;
  const emailError = deliveryStatus.email_error;
  const noteStatus = deliveryStatus.note;

  if (emailStatus === "sent") {
    badges.push({ key: "deliveryEmailSent", tone: "success" });
  } else if (emailStatus === "failed") {
    badges.push({
      key: "deliveryEmailFailed",
      tone: "error",
      detail: typeof emailError === "string" && emailError.trim()
        ? emailError
        : "请检查 SMTP 配置或认证信息",
    });
  } else if (emailStatus === "skipped_no_address") {
    badges.push({ key: "deliveryEmailSkippedNoAddress", tone: "muted" });
  }

  if (noteStatus === "created") {
    badges.push({ key: "deliveryNoteCreated", tone: "success" });
  } else if (noteStatus === "skipped_no_notebook") {
    badges.push({ key: "deliveryNoteSkippedNoNotebook", tone: "muted" });
  }

  return badges;
}
