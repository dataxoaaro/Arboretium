import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../../src/routes/Settings";
import { AuthContext, type AuthState } from "../../src/lib/use-auth";
import { api, ApiCallError } from "../../src/lib/api";
import type { User } from "../../src/lib/api";
import { rejected } from "./rejected";

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return { ...actual, api: { ...actual.api, changePassword: vi.fn() } };
});

const USER: User = {
  id: "u1",
  email: "me@test.local",
  display_name: "Me",
  created_at: 0,
};

function renderSettings(logout = vi.fn()) {
  const value: AuthState = {
    user: USER,
    loading: false,
    refresh: async () => {},
    logout,
    setUser: () => {},
  };
  render(
    <AuthContext.Provider value={value}>
      <Settings />
    </AuthContext.Provider>,
  );
  return { logout };
}

describe("Settings", () => {
  it("shows the signed-in email", () => {
    renderSettings();
    expect(screen.getByText("me@test.local")).toBeInTheDocument();
  });

  it("changes the password and confirms success", async () => {
    vi.mocked(api.changePassword).mockResolvedValue({ ok: true });
    renderSettings();
    await userEvent.type(
      screen.getByLabelText("Current password"),
      "old-password",
    );
    await userEvent.type(
      screen.getByLabelText("New password (≥10 chars)"),
      "new-password-xx",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Update password" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Password updated.")).toBeInTheDocument(),
    );
    expect(api.changePassword).toHaveBeenCalledWith({
      current_password: "old-password",
      new_password: "new-password-xx",
    });
  });

  it("shows an error when the current password is wrong", async () => {
    vi.mocked(api.changePassword).mockReturnValue(
      rejected(new ApiCallError("Current password incorrect", 401)),
    );
    renderSettings();
    await userEvent.type(screen.getByLabelText("Current password"), "wrong");
    await userEvent.type(
      screen.getByLabelText("New password (≥10 chars)"),
      "new-password-xx",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Update password" }),
    );
    expect(
      await screen.findByText("Current password incorrect"),
    ).toBeInTheDocument();
  });

  it("signs out", async () => {
    const { logout } = renderSettings();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalled();
  });
});
