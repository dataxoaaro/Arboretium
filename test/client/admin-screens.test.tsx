import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AdminLayout } from "../../src/admin/AdminLayout";
import { AdminBackups } from "../../src/admin/AdminBackups";
import { AdminProperties } from "../../src/admin/AdminProperties";
import { AdminUsers } from "../../src/admin/AdminUsers";
import { adminApi, AdminApiError } from "../../src/admin/admin-api";
import type {
  AdminStats,
  PropertyRow,
  UserRow,
} from "../../src/admin/admin-types";
import { rejected } from "./rejected";
import { t } from "../../src/lib/strings";

vi.mock("../../src/admin/admin-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/admin/admin-api")>();
  return {
    ...actual,
    adminApi: {
      stats: vi.fn(),
      listProperties: vi.fn(),
      archiveProperty: vi.fn(),
      restoreProperty: vi.fn(),
      listUsers: vi.fn(),
      deleteUser: vi.fn(),
      generateResetLink: vi.fn(),
    },
  };
});

afterEach(() => vi.unstubAllGlobals());

function inRouter(node: React.ReactNode, path = "/admin") {
  render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
}

describe("AdminLayout", () => {
  it("renders the section nav and the nested outlet", () => {
    render(
      <MemoryRouter initialEntries={["/admin/properties"]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="properties" element={<div>OUTLET CONTENT</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: t.adminNavProperties }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.adminNavUsers }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.adminNavBackups }),
    ).toBeInTheDocument();
    expect(screen.getByText("OUTLET CONTENT")).toBeInTheDocument();
  });
});

describe("AdminBackups", () => {
  const stats: AdminStats = {
    users: 3,
    properties_active: 2,
    properties_archived: 1,
    plants: 40,
    photos: 12,
  };

  it("shows DB stats and the backup command", async () => {
    vi.mocked(adminApi.stats).mockResolvedValue(stats);
    inRouter(<AdminBackups />);
    expect(await screen.findByText("40")).toBeInTheDocument();
    expect(screen.getByText("pnpm admin:backup")).toBeInTheDocument();
  });

  it("shows an error when stats fail", async () => {
    vi.mocked(adminApi.stats).mockReturnValue(
      rejected(new AdminApiError("boom", 500)),
    );
    inRouter(<AdminBackups />);
    expect(await screen.findByText(t.adminLoadStatsFailed)).toBeInTheDocument();
  });
});

describe("AdminProperties", () => {
  function prop(over: Partial<PropertyRow>): PropertyRow {
    return {
      id: crypto.randomUUID(),
      owner_id: "o",
      name: "Cottage",
      boundary_geojson: null,
      included_hexes: "[]",
      center_lat: null,
      center_lng: null,
      archived_at: null,
      created_at: 0,
      updated_at: 0,
      ...over,
    } as PropertyRow;
  }

  it("splits active and archived and archives on confirm", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const active = prop({ name: "Active One" });
    vi.mocked(adminApi.listProperties).mockResolvedValue([
      active,
      prop({ name: "Old One", archived_at: 123 }),
    ]);
    vi.mocked(adminApi.archiveProperty).mockResolvedValue({
      ok: true,
      archived_at: 1,
    });
    inRouter(<AdminProperties />);

    expect(await screen.findByText("Active One")).toBeInTheDocument();
    expect(screen.getByText("Old One")).toBeInTheDocument();
    expect(screen.getByText(t.adminActive(1))).toBeInTheDocument();
    expect(screen.getByText(t.adminArchived(1))).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: t.adminArchiveAction }),
    );
    await waitFor(() =>
      expect(adminApi.archiveProperty).toHaveBeenCalledWith(active.id),
    );
  });

  it("restores an archived property", async () => {
    const archived = prop({ name: "Old One", archived_at: 123 });
    vi.mocked(adminApi.listProperties).mockResolvedValue([archived]);
    vi.mocked(adminApi.restoreProperty).mockResolvedValue({ ok: true });
    inRouter(<AdminProperties />);
    await userEvent.click(
      await screen.findByRole("button", { name: t.adminRestoreAction }),
    );
    await waitFor(() =>
      expect(adminApi.restoreProperty).toHaveBeenCalledWith(archived.id),
    );
  });

  it("shows an error when loading fails", async () => {
    vi.mocked(adminApi.listProperties).mockReturnValue(
      rejected(new AdminApiError("nope", 500)),
    );
    inRouter(<AdminProperties />);
    expect(
      await screen.findByText(t.adminLoadPropertiesFailed),
    ).toBeInTheDocument();
  });
});

describe("AdminUsers", () => {
  function user(over: Partial<UserRow>): UserRow {
    return {
      id: crypto.randomUUID(),
      email: "a@b.c",
      display_name: "Aaro",
      created_at: 0,
      membership_count: 1,
      ...over,
    } as UserRow;
  }

  it("lists users and generates a reset link", async () => {
    const u = user({ display_name: "Aaro", email: "aaro@test.local" });
    vi.mocked(adminApi.listUsers).mockResolvedValue([u]);
    vi.mocked(adminApi.generateResetLink).mockResolvedValue({
      token: "tok-xyz",
      expires_at: Date.now() + 86_400_000,
    });
    inRouter(<AdminUsers />);

    expect(await screen.findByText("aaro@test.local")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: t.adminResetLink }),
    );
    expect(
      await screen.findByDisplayValue(/\/reset\/tok-xyz$/),
    ).toBeInTheDocument();
    expect(adminApi.generateResetLink).toHaveBeenCalledWith(u.id, u.id);
  });

  it("copies the reset link and dismisses the banner", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    vi.mocked(adminApi.listUsers).mockResolvedValue([user({})]);
    vi.mocked(adminApi.generateResetLink).mockResolvedValue({
      token: "tok-xyz",
      expires_at: Date.now() + 86_400_000,
    });
    inRouter(<AdminUsers />);
    await userEvent.click(
      await screen.findByRole("button", { name: t.adminResetLink }),
    );
    await userEvent.click(screen.getByRole("button", { name: t.adminCopy }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/reset/tok-xyz"),
      ),
    );
    expect(
      screen.getByRole("button", { name: t.adminCopied }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t.adminDismiss }));
    expect(screen.queryByDisplayValue(/reset/)).not.toBeInTheDocument();
  });

  it("deletes a user on confirm", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const u = user({});
    vi.mocked(adminApi.listUsers).mockResolvedValue([u]);
    vi.mocked(adminApi.deleteUser).mockResolvedValue({ ok: true });
    inRouter(<AdminUsers />);
    await userEvent.click(
      await screen.findByRole("button", { name: t.delete }),
    );
    await waitFor(() => expect(adminApi.deleteUser).toHaveBeenCalledWith(u.id));
  });

  it("does not delete when cancelled", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    vi.mocked(adminApi.listUsers).mockResolvedValue([user({})]);
    inRouter(<AdminUsers />);
    await userEvent.click(
      await screen.findByRole("button", { name: t.delete }),
    );
    expect(adminApi.deleteUser).not.toHaveBeenCalled();
  });

  it("surfaces a delete error", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.mocked(adminApi.listUsers).mockResolvedValue([user({})]);
    vi.mocked(adminApi.deleteUser).mockReturnValue(
      rejected(new AdminApiError("Delete failed", 500)),
    );
    inRouter(<AdminUsers />);
    await userEvent.click(
      await screen.findByRole("button", { name: t.delete }),
    );
    expect(
      await screen.findByText(t.adminDeleteUserFailed),
    ).toBeInTheDocument();
  });

  it("surfaces a reset-link error", async () => {
    vi.mocked(adminApi.listUsers).mockResolvedValue([user({})]);
    vi.mocked(adminApi.generateResetLink).mockReturnValue(
      rejected(new AdminApiError("Reset link failed", 500)),
    );
    inRouter(<AdminUsers />);
    await userEvent.click(
      await screen.findByRole("button", { name: t.adminResetLink }),
    );
    expect(await screen.findByText(t.adminResetLinkFailed)).toBeInTheDocument();
  });

  it("shows the empty state with no users", async () => {
    vi.mocked(adminApi.listUsers).mockResolvedValue([]);
    inRouter(<AdminUsers />);
    expect(await screen.findByText(t.adminNoUsers)).toBeInTheDocument();
  });
});
