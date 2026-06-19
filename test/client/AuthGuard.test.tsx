import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext, type AuthState } from "../../src/lib/use-auth";
import { AuthGuard } from "../../src/components/AuthGuard";
import type { User } from "../../src/lib/api";

const USER: User = {
  id: "u1",
  email: "a@b.c",
  display_name: "A",
  created_at: 0,
};

function renderGuard(state: Partial<AuthState>) {
  const value: AuthState = {
    user: null,
    loading: false,
    refresh: async () => {},
    logout: async () => {},
    setUser: () => {},
    ...state,
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route
            path="/secret"
            element={
              <AuthGuard>
                <div>SECRET CONTENT</div>
              </AuthGuard>
            }
          />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("AuthGuard", () => {
  it("shows a loading state while auth resolves", () => {
    renderGuard({ loading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated", () => {
    renderGuard({ loading: false, user: null });
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    renderGuard({ loading: false, user: USER });
    expect(screen.getByText("SECRET CONTENT")).toBeInTheDocument();
  });
});
