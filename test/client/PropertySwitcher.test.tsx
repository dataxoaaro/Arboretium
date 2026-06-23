import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PropertySwitcher } from "../../src/components/PropertySwitcher";
import { api, type Property } from "../../src/lib/api";
import { t } from "../../src/lib/strings";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return { ...actual, api: { ...actual.api, listProperties: vi.fn() } };
});

function prop(id: string, name: string): Property {
  return {
    id,
    owner_id: "o",
    name,
    boundary_geojson: null,
    included_hexes: "[]",
    center_lat: null,
    center_lng: null,
    archived_at: null,
    created_at: 0,
    updated_at: 0,
  };
}

function renderSwitcher() {
  render(
    <MemoryRouter initialEntries={["/properties/p1"]}>
      <Routes>
        <Route path="/properties/:propertyId" element={<PropertySwitcher />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PropertySwitcher", () => {
  it("loads the list on mount, shows the current name, and navigates on selection", async () => {
    vi.mocked(api.listProperties).mockResolvedValue([
      prop("p1", "Cottage"),
      prop("p2", "House"),
    ]);
    renderSwitcher();

    // Loaded eagerly so the button shows the current property's name (not the
    // generic placeholder) without opening the dropdown.
    expect(await screen.findByText("Cottage")).toBeInTheDocument();
    expect(api.listProperties).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("House")).toBeInTheDocument();

    await userEvent.click(screen.getByText("House"));
    expect(navigateMock).toHaveBeenCalledWith("/properties/p2");
  });

  it("shows an empty message when there are no other properties", async () => {
    vi.mocked(api.listProperties).mockResolvedValue([]);
    renderSwitcher();
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(t.switcherNone)).toBeInTheDocument();
  });
});
