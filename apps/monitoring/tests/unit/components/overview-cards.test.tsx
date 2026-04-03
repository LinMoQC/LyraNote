import { render, screen } from "@testing-library/react";

import { OverviewCards } from "@/components/overview-cards";

describe("OverviewCards", () => {
  it("renders the key monitoring metrics", () => {
    render(
      <OverviewCards
        overview={{
          window: "24h",
          requests: { total: 128, errors_5xx: 3, p50_ms: 120, p95_ms: 780 },
          chat: { total: 24, success_rate: 95.8 },
          workloads: { running: 5, stuck: 1 },
          workers: { total: 3, healthy: 2, stale: 1, down: 0 },
        }}
      />,
    );

    expect(screen.getByText("请求总量")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("95.8%")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });
});
