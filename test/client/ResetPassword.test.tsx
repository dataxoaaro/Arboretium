import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ResetPassword } from "../../src/routes/ResetPassword";
import { api, ApiCallError } from "../../src/lib/api";
import { rejected } from "./rejected";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return { ...actual, api: { ...actual.api, resetPassword: vi.fn() } };
});

function renderReset(token = "tok-123") {
  render(
    <MemoryRouter initialEntries={[`/reset/${token}`]}>
      <Routes>
        <Route path="/reset/:token" element={<ResetPassword />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResetPassword", () => {
  it("submits the token and new password, then shows the done state", async () => {
    vi.mocked(api.resetPassword).mockResolvedValue({ ok: true });
    renderReset("tok-abc");

    await userEvent.type(
      screen.getByLabelText("New password (≥10 chars)"),
      "new-password-xx",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset password" }),
    );

    expect(await screen.findByText(/Done\. Redirecting/)).toBeInTheDocument();
    expect(api.resetPassword).toHaveBeenCalledWith({
      token: "tok-abc",
      new_password: "new-password-xx",
    });
  });

  it("shows an error for an invalid token", async () => {
    vi.mocked(api.resetPassword).mockReturnValue(
      rejected(new ApiCallError("Invalid or expired token", 400)),
    );
    renderReset();
    await userEvent.type(
      screen.getByLabelText("New password (≥10 chars)"),
      "new-password-xx",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset password" }),
    );
    expect(
      await screen.findByText("Invalid or expired token"),
    ).toBeInTheDocument();
  });
});
