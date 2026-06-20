import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PropertyPlants } from "../../src/routes/PropertyPlants";
import { CurrentPropertyContext } from "../../src/lib/property-context";
import {
  api,
  ApiCallError,
  type Plant,
  type Property,
} from "../../src/lib/api";
import { rejected } from "./rejected";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return { ...actual, api: { ...actual.api, listPlants: vi.fn() } };
});

const PROPERTY = {
  id: "p1",
  name: "Cottage",
  included_hexes: "[]",
} as unknown as Property;

function plant(over: Partial<Plant>): Plant {
  return {
    id: crypto.randomUUID(),
    property_id: "p1",
    h3_res15: "c",
    lat: 0,
    lng: 0,
    common_name: "Plant",
    latin_name: null,
    plant_type: null,
    planted_date: null,
    source: null,
    notes: null,
    archived: 0,
    created_by: "u",
    created_at: 0,
    last_edited_by: "u",
    updated_at: 0,
    ...over,
  };
}

function renderPlants() {
  render(
    <MemoryRouter initialEntries={["/properties/p1/plants"]}>
      <Routes>
        <Route
          path="/properties/:propertyId/plants"
          element={
            <CurrentPropertyContext.Provider value={PROPERTY}>
              <PropertyPlants />
            </CurrentPropertyContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PropertyPlants", () => {
  it("renders plants with count and species count", async () => {
    vi.mocked(api.listPlants).mockResolvedValue([
      plant({ common_name: "Oak", latin_name: "Quercus" }),
      plant({ common_name: "Birch", latin_name: "Betula" }),
    ]);
    renderPlants();
    expect(await screen.findByText("Oak")).toBeInTheDocument();
    expect(screen.getByText("2 plants · 2 species")).toBeInTheDocument();
  });

  it("filters by the search box", async () => {
    vi.mocked(api.listPlants).mockResolvedValue([
      plant({ common_name: "Oak", notes: "shady spot" }),
      plant({ common_name: "Birch" }),
    ]);
    renderPlants();
    await screen.findByText("Oak");
    await userEvent.type(screen.getByPlaceholderText(/Search/), "birch");
    expect(screen.queryByText("Oak")).not.toBeInTheDocument();
    expect(screen.getByText("Birch")).toBeInTheDocument();
  });

  it("shows a no-match row when search finds nothing", async () => {
    vi.mocked(api.listPlants).mockResolvedValue([
      plant({ common_name: "Oak" }),
    ]);
    renderPlants();
    await screen.findByText("Oak");
    await userEvent.type(screen.getByPlaceholderText(/Search/), "zzz");
    expect(screen.getByText(/No plants match/)).toBeInTheDocument();
  });

  it("navigates to the map with the plant hash on 'Show on map'", async () => {
    const p = plant({ common_name: "Oak" });
    vi.mocked(api.listPlants).mockResolvedValue([p]);
    renderPlants();
    await screen.findByText("Oak");
    await userEvent.click(screen.getByRole("button", { name: "Show on map" }));
    expect(navigateMock).toHaveBeenCalledWith(`/properties/p1#plant=${p.id}`);
  });

  it("re-sorts when a column header is clicked", async () => {
    vi.mocked(api.listPlants).mockResolvedValue([
      plant({ common_name: "Birch" }),
      plant({ common_name: "Oak" }),
    ]);
    renderPlants();
    await screen.findByText("Oak");
    const firstNameBefore = within(screen.getAllByRole("row")[1]).getByText(
      /Birch|Oak/,
    ).textContent;
    expect(firstNameBefore).toBe("Birch"); // asc by default
    await userEvent.click(screen.getByRole("button", { name: /Name/ }));
    const firstNameAfter = within(screen.getAllByRole("row")[1]).getByText(
      /Birch|Oak/,
    ).textContent;
    expect(firstNameAfter).toBe("Oak"); // desc
  });

  it("shows the empty state with no plants", async () => {
    vi.mocked(api.listPlants).mockResolvedValue([]);
    renderPlants();
    expect(
      await screen.findByText(/No plants in this property yet/),
    ).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    vi.mocked(api.listPlants).mockReturnValue(
      rejected(new ApiCallError("Failed to load plants", 500)),
    );
    renderPlants();
    await waitFor(() =>
      expect(screen.getByText("Failed to load plants")).toBeInTheDocument(),
    );
  });
});
