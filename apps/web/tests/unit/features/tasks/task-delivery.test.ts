import { describe, expect, it } from "vitest";

import { getTaskDeliveryBadges } from "@/features/tasks/task-delivery";

describe("getTaskDeliveryBadges", () => {
  it("maps email failures with detail", () => {
    expect(
      getTaskDeliveryBadges({
        email: "failed",
        email_error: "auth failed",
      }),
    ).toEqual([
      {
        key: "deliveryEmailFailed",
        tone: "error",
        detail: "auth failed",
      },
    ]);
  });

  it("falls back to a default detail when backend reason is missing", () => {
    expect(
      getTaskDeliveryBadges({
        email: "failed",
      }),
    ).toEqual([
      {
        key: "deliveryEmailFailed",
        tone: "error",
        detail: "请检查 SMTP 配置或认证信息",
      },
    ]);
  });

  it("maps successful multi-channel delivery", () => {
    expect(
      getTaskDeliveryBadges({
        email: "sent",
        note: "created",
      }),
    ).toEqual([
      {
        key: "deliveryEmailSent",
        tone: "success",
      },
      {
        key: "deliveryNoteCreated",
        tone: "success",
      },
    ]);
  });

  it("maps skipped delivery states", () => {
    expect(
      getTaskDeliveryBadges({
        email: "skipped_no_address",
        note: "skipped_no_notebook",
      }),
    ).toEqual([
      {
        key: "deliveryEmailSkippedNoAddress",
        tone: "muted",
      },
      {
        key: "deliveryNoteSkippedNoNotebook",
        tone: "muted",
      },
    ]);
  });
});
