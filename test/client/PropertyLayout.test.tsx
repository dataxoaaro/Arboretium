import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PropertyLayout } from "../../src/routes/PropertyLayout";
import { useCurrentProperty } from "../../src/lib/property-context";
import { api, ApiCallError, type Property } from "../../src/lib/api";
import { rejected } from "./rejected";

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return { ...actual, api: { ...actual.api, getProperty: vi.fn() } };
});

function Child() {
  const p = useCurrentProperty();
  return <div>CHILD: {p.name}</div>;
}

function renderLayout() {
  render(
    <MemoryRouter initialEntries={["/properties/p1"]}>
      <Routes>
        <Route path="/properties/:propertyId" element={<PropertyLayout />}>
          <Route index element={<Child />} />
        </Route>
        <Route path="/properties" element={<div>PICKER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function prop(): Property {
  return {
    id: "p1",
    owner_id: "o",
    name: "Cottage",
    boundary_geojson: null,
    included_hexes: "[]",
    center_lat: null,
    center_lng: null,
    archived_at: null,
    created_at: 0,
    updated_at: 0,
  };
}

describe("PropertyLayout", () => {
  it("loads the property and renders the nested route via context", async () => {
    vi.mocked(api.getProperty).mockResolvedValue(prop());
    renderLayout();
    expect(screen.getByText("Loading property…")).toBeInTheDocument();
    expect(await screen.findByText("CHILD: Cottage")).toBeInTheDocument();
  });

  it("redirects to the picker on a 404", async () => {
    vi.mocked(api.getProperty).mockReturnValue(
      rejected(new ApiCallError("Not found", 404)),
    );
    renderLayout();
    await waitFor(() => expect(screen.getByText("PICKER")).toBeInTheDocument());
  });

  it("shows an error message on a non-404 failure", async () => {
    vi.mocked(api.getProperty).mockReturnValue(
      rejected(new ApiCallError("Server boom", 500)),
    );
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText("Server boom")).toBeInTheDocument(),
    );
  });
});
