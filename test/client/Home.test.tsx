import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Home } from "../../src/routes/Home";
import { AuthContext, type AuthState } from "../../src/lib/use-auth";
import { t } from "../../src/lib/strings";

const AUTH: AuthState = {
  user: null,
  loading: false,
  refresh: async () => {},
  logout: async () => {},
  setUser: () => {},
};

describe("Home", () => {
  it("renders the app title", () => {
    render(
      <AuthContext.Provider value={AUTH}>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole("heading", { name: t.brand })).toBeInTheDocument();
  });
});
