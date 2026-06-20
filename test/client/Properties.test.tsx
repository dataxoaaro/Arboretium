import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Properties } from "../../src/routes/Properties";
import { api, ApiCallError, type Property } from "../../src/lib/api";
import { rejected } from "./rejected";

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return { ...actual, api: { ...actual.api, listProperties: vi.fn() } };
});

function prop(over: Partial<Property> = {}): Property {
  return {
    id: "p1",
    owner_id: "o",
    name: "Cottage",
    boundary_geojson: null,
    included_hexes: JSON.stringify(["a", "b", "c"]),
    center_lat: 60.1,
    center_lng: 24.9,
    archived_at: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

function renderProperties() {
  render(
    <MemoryRouter>
      <Properties />
    </MemoryRouter>,
  );
}

describe("Properties picker", () => {
  it("lists properties with their hex count", async () => {
    vi.mocked(api.listProperties).mockResolvedValue([prop()]);
    renderProperties();
    await waitFor(() =>
      expect(screen.getByText("Cottage")).toBeInTheDocument(),
    );
    expect(screen.getByText(/3 hexes/)).toBeInTheDocument();
  });

  it("shows the empty state when the user has no properties", async () => {
    vi.mocked(api.listProperties).mockResolvedValue([]);
    renderProperties();
    await waitFor(() =>
      expect(
        screen.getByText("You're not a member of any property yet."),
      ).toBeInTheDocument(),
    );
  });

  it("shows an error message on failure", async () => {
    vi.mocked(api.listProperties).mockReturnValue(
      rejected(new ApiCallError("Failed to load", 500)),
    );
    renderProperties();
    await waitFor(() =>
      expect(screen.getByText("Failed to load")).toBeInTheDocument(),
    );
  });
});
