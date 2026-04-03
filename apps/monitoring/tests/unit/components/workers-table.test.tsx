import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkersTable } from "@/components/workers-table";

describe("WorkersTable", () => {
  it("renders worker status rows", () => {
    render(
      <WorkersTable
        workers={[
          {
            component: "worker",
            instance_id: "worker:host:1",
            hostname: "host",
            pid: 1234,
            status: "stale",
            last_seen_at: "2026-04-02T10:00:00+00:00",
            metadata: {},
          },
        ]}
      />,
    );

    expect(screen.getByText("worker")).toBeInTheDocument();
    expect(screen.getByText("worker:host:1")).toBeInTheDocument();
    expect(screen.getByText("stale")).toBeInTheDocument();
  });

  it("paginates worker rows on the client", async () => {
    const user = userEvent.setup();

    const workers = Array.from({ length: 13 }, (_, index) => ({
      component: "worker",
      instance_id: `worker:host:${index + 1}`,
      hostname: "host",
      pid: 1200 + index,
      status: "healthy",
      last_seen_at: "2026-04-02T10:00:00+00:00",
      metadata: {},
    }));

    render(<WorkersTable workers={workers} />);

    expect(screen.getByText("第 1 / 2 页 · 每页 12 条 · 共 13 条")).toBeInTheDocument();
    expect(screen.getByText("worker:host:12")).toBeInTheDocument();
    expect(screen.queryByText("worker:host:13")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /下一页/i }));

    expect(screen.getByText("第 2 / 2 页 · 每页 12 条 · 共 13 条")).toBeInTheDocument();
    expect(screen.getByText("worker:host:13")).toBeInTheDocument();
  });
});
