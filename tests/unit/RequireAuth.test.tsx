import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Hoisted to dodge the vi.mock factory TDZ trap.
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

import RequireAuth from "@/features/auth/RequireAuth";

function renderRequireAuth(initialPath = "/protected") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route element={<RequireAuth />}>
          <Route
            path="/protected"
            element={<div data-testid="protected-content">secret</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("renders a spinner when status is 'loading'", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      role: "staff",
      status: "loading",
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    renderRequireAuth();

    expect(screen.getByTestId("auth-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("redirects to /login when status is 'unauthenticated'", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      role: "staff",
      status: "unauthenticated",
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    renderRequireAuth();

    // The /login route renders because the <Navigate /> swap has fired.
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-loading")).not.toBeInTheDocument();
  });

  it("renders children when status is 'authenticated'", () => {
    mockUseAuth.mockReturnValue({
      user: { uid: "u1", email: "u1@example.com" },
      role: "admin",
      status: "authenticated",
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    renderRequireAuth();

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });
});