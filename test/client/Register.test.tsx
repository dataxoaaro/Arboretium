import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Register } from "../../src/routes/Register";
import { AuthContext, type AuthState } from "../../src/lib/use-auth";
import { api, ApiCallError } from "../../src/lib/api";
import { rejected } from "./rejected";

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return { ...actual, api: { ...actual.api, register: vi.fn() } };
});

function renderRegister(setUser = vi.fn()) {
  const value: AuthState = {
    user: null,
    loading: false,
    refresh: async () => {},
    logout: async () => {},
    setUser,
  };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/properties" element={<div>PROPERTIES PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { setUser };
}

async function fillForm() {
  await userEvent.type(screen.getByLabelText("Email"), "a@b.c");
  await userEvent.type(screen.getByLabelText("Display name"), "Aaro");
  await userEvent.type(
    screen.getByLabelText("Password (≥10 chars)"),
    "a-good-password",
  );
  await userEvent.type(screen.getByLabelText("Site password"), "site-secret");
}

describe("Register", () => {
  it("registers and navigates to /properties", async () => {
    const user = {
      id: "u1",
      email: "a@b.c",
      display_name: "Aaro",
      created_at: 0,
    };
    vi.mocked(api.register).mockResolvedValue(user);
    const { setUser } = renderRegister();

    await fillForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );

    await waitFor(() =>
      expect(screen.getByText("PROPERTIES PAGE")).toBeInTheDocument(),
    );
    expect(api.register).toHaveBeenCalledWith({
      email: "a@b.c",
      password: "a-good-password",
      display_name: "Aaro",
      site_password: "site-secret",
    });
    expect(setUser).toHaveBeenCalledWith(user);
  });

  it("surfaces the server error", async () => {
    vi.mocked(api.register).mockReturnValue(
      rejected(new ApiCallError("Registration not authorised", 403)),
    );
    renderRegister();
    await fillForm();
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Registration not authorised"),
      ).toBeInTheDocument(),
    );
  });
});
