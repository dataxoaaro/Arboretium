import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Login } from "../../src/routes/Login";
import { AuthContext, type AuthState } from "../../src/lib/use-auth";
import { api, ApiCallError } from "../../src/lib/api";
import { rejected } from "./rejected";

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return { ...actual, api: { ...actual.api, login: vi.fn() } };
});

function renderLogin(setUser = vi.fn()) {
  const value: AuthState = {
    user: null,
    loading: false,
    refresh: async () => {},
    logout: async () => {},
    setUser,
  };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/properties" element={<div>PROPERTIES PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { setUser };
}

describe("Login", () => {
  it("submits credentials, stores the user, and navigates to /properties", async () => {
    const user = {
      id: "u1",
      email: "a@b.c",
      display_name: "A",
      created_at: 0,
    };
    vi.mocked(api.login).mockResolvedValue(user);
    const { setUser } = renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "a@b.c");
    await userEvent.type(screen.getByLabelText("Password"), "a-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByText("PROPERTIES PAGE")).toBeInTheDocument(),
    );
    expect(api.login).toHaveBeenCalledWith({
      email: "a@b.c",
      password: "a-password",
    });
    expect(setUser).toHaveBeenCalledWith(user);
  });

  it("shows the server error message on failure", async () => {
    vi.mocked(api.login).mockReturnValue(
      rejected(new ApiCallError("Invalid email or password", 401)),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "a@b.c");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument(),
    );
    expect(screen.queryByText("PROPERTIES PAGE")).not.toBeInTheDocument();
  });
});
