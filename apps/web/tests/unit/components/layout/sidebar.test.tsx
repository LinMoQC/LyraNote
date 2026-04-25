import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layout/sidebar";
import { getInsights } from "@/services/ai-service";
import { getNotebooks } from "@/services/notebook-service";
import { useUiStore } from "@/store/use-ui-store";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  m: {
    aside: ({ children, initial: _initial, animate: _animate, transition: _transition, ...props }: { children?: ReactNode; [key: string]: unknown }) => <aside {...props}>{children}</aside>,
    div: ({ children, initial: _initial, animate: _animate, transition: _transition, ...props }: { children?: ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
    span: ({ children, initial: _initial, animate: _animate, transition: _transition, ...props }: { children?: ReactNode; [key: string]: unknown }) => <span {...props}>{children}</span>,
  },
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { name: "Kai", username: "kai" },
    isLoading: false,
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => ({ matches: false, ready: false }),
}));

vi.mock("@/services/notebook-service", () => ({
  getNotebooks: vi.fn(),
}));

vi.mock("@/services/ai-service", () => ({
  getInsights: vi.fn(),
  markInsightRead: vi.fn(),
  markAllInsightsRead: vi.fn(),
}));

vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <div>theme</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.mocked(getNotebooks).mockImplementation(() => new Promise(() => {}));
    vi.mocked(getInsights).mockImplementation(() => new Promise(() => {}));
    useUiStore.setState({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
    });
  });

  it("keeps the mobile sidebar off-canvas by default", () => {
    const { container } = render(<Sidebar />);

    const aside = container.querySelector("aside");
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain("-translate-x-full");
    expect(aside?.className).toContain("md:translate-x-0");
    expect(screen.getByText("LyraNote")).toBeInTheDocument();
  });

  it("uses the collapsed desktop width class when sidebar is collapsed", () => {
    useUiStore.setState({
      sidebarCollapsed: true,
      sidebarMobileOpen: false,
    });

    const { container } = render(<Sidebar />);
    const aside = container.querySelector("aside");

    expect(aside).toBeTruthy();
    expect(aside?.className).toContain("md:w-16");
    expect(aside?.className).not.toContain("md:w-[240px]");
  });
});
