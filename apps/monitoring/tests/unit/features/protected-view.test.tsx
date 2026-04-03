import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ProtectedView } from "@/components/protected-view";

const replace = vi.fn();
const useAuth = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace,
  }),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => useAuth(),
}));

describe("ProtectedView", () => {
  beforeEach(() => {
    replace.mockReset();
    useAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it("redirects unauthorized users to the ops login page", () => {
    render(
      <ProtectedView unauthorized>
        <div>secret</div>
      </ProtectedView>,
    );

    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.getByText("登录状态已失效，正在跳转到登录页。")).toBeInTheDocument();
  });

  it("shows a loading state while auth is being refreshed", () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    render(
      <ProtectedView unauthorized={false}>
        <div>secret</div>
      </ProtectedView>,
    );

    expect(screen.getByText("正在校验登录态...")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
