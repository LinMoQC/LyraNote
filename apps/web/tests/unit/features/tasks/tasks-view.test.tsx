import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { TasksView } from "@/features/tasks/tasks-view";
import { buildScheduledTask } from "@test/fixtures/task.factory";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/features/tasks/task-card", () => ({
  TaskCard: ({ task }: { task: { name: string } }) => (
    <div data-testid="task-card">{task.name}</div>
  ),
}));

const { useQuery } = await import("@tanstack/react-query");
const mockedUseQuery = vi.mocked(useQuery);
const { useMediaQuery } = await import("@/hooks/use-media-query");
const mockedUseMediaQuery = vi.mocked(useMediaQuery);

describe("TasksView", () => {
  it("keeps the create task card on desktop", () => {
    mockedUseMediaQuery.mockReturnValue({ matches: false, ready: true });
    mockedUseQuery.mockReturnValue({
      data: [buildScheduledTask({ id: "1", name: "planet-ai" })],
      isLoading: false,
    } as never);

    render(<TasksView />);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByTestId("new-task-card")).toBeInTheDocument();
    expect(screen.getByTestId("task-card")).toHaveTextContent("planet-ai");
  });

  it("hides the create task card on mobile", () => {
    mockedUseMediaQuery.mockReturnValue({ matches: true, ready: true });
    mockedUseQuery.mockReturnValue({
      data: [
        buildScheduledTask({ id: "1", name: "planet-ai" }),
        buildScheduledTask({ id: "2", name: "openai" }),
      ],
      isLoading: false,
    } as never);

    render(<TasksView />);

    expect(screen.queryByTestId("new-task-card")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("task-card")).toHaveLength(2);
  });
});
