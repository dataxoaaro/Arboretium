import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HeaderMenu } from "../../src/components/HeaderMenu";
import type { User } from "../../src/lib/api";

const USER: User = {
  id: "u",
  email: "a@b.c",
  display_name: "Aaro",
  created_at: 0,
};

function renderMenu(logout = vi.fn()) {
  render(
    <MemoryRouter>
      <HeaderMenu user={USER} logout={logout} />
    </MemoryRouter>,
  );
  return { logout };
}

describe("HeaderMenu", () => {
  it("is closed until the trigger is tapped", async () => {
    renderMenu();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Aaro/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "My properties" }),
    ).toHaveAttribute("href", "/properties");
    expect(
      screen.getByRole("menuitem", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("signs out and closes the menu", async () => {
    const { logout } = renderMenu();
    await userEvent.click(screen.getByRole("button", { name: /Aaro/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(logout).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: /Aaro/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
