import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CellSheet } from "../../src/components/cells/CellSheet";
import {
  api,
  ApiCallError,
  type CellDetail,
  type Photo,
  type Plant,
} from "../../src/lib/api";
import { cellAtPoint } from "../../src/lib/h3";
import { t } from "../../src/lib/strings";
import { rejected } from "./rejected";

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getCell: vi.fn(),
      setCellNotes: vi.fn(),
      uploadPhoto: vi.fn(),
      updatePhoto: vi.fn(),
      deletePhoto: vi.fn(),
    },
  };
});

vi.mock("../../src/lib/photos", () => ({
  preparePhoto: vi.fn(async () => ({
    blob: new Blob(["x"], { type: "image/jpeg" }),
    mimeType: "image/jpeg",
    takenAt: 1000,
  })),
}));

const H3 = cellAtPoint({ lat: 60.17, lng: 24.94 });
const PROP = "prop-1";

function plant(over: Partial<Plant> = {}): Plant {
  return {
    id: "plant-1",
    property_id: PROP,
    h3_res15: H3,
    lat: 60.17,
    lng: 24.94,
    common_name: "Rowan",
    latin_name: "Sorbus aucuparia",
    plant_type: "tree",
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

function photo(over: Partial<Photo> = {}): Photo {
  return {
    id: "ph1",
    plant_id: null,
    cell_property_id: PROP,
    cell_h3_res15: H3,
    r2_key: "k",
    caption: "before planting",
    taken_at: 1000,
    uploaded_at: 2000,
    uploaded_by: "u",
    ...over,
  };
}

function detail(over: Partial<CellDetail> = {}): CellDetail {
  return {
    property_id: PROP,
    h3_res15: H3,
    notes: null,
    plants: [],
    photos: [],
    ...over,
  };
}

function renderSheet(over?: {
  onOpenPlant?: (p: Plant) => void;
  onAddPlant?: (h3: string) => void;
  onChanged?: () => void;
  onClose?: () => void;
}) {
  const props = {
    onOpenPlant: vi.fn(),
    onAddPlant: vi.fn(),
    onChanged: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<CellSheet open propertyId={PROP} h3={H3} {...props} />);
  return props;
}

beforeEach(() => {
  vi.mocked(api.getCell).mockResolvedValue(detail());
});
afterEach(() => vi.unstubAllGlobals());

describe("CellSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CellSheet
        open={false}
        propertyId={PROP}
        h3={H3}
        onClose={() => {}}
        onOpenPlant={() => {}}
        onAddPlant={() => {}}
        onChanged={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the empty state and offers to add a plant", async () => {
    const { onAddPlant } = renderSheet();
    expect(await screen.findByText(t.cellNoPlants)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: t.cellAddPlantHere }),
    );
    expect(onAddPlant).toHaveBeenCalledWith(H3);
  });

  it("lists plants and opens one on tap", async () => {
    vi.mocked(api.getCell).mockResolvedValue(detail({ plants: [plant()] }));
    const { onOpenPlant } = renderSheet();
    await userEvent.click(await screen.findByText("Rowan"));
    expect(onOpenPlant).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plant-1" }),
    );
  });

  it("saves notes and signals a change", async () => {
    vi.mocked(api.setCellNotes).mockResolvedValue({
      property_id: PROP,
      h3_res15: H3,
      notes: "rocky",
    });
    const { onChanged } = renderSheet();
    await screen.findByText(t.cellNoPlants);
    await userEvent.type(
      screen.getByPlaceholderText(t.cellNotesPlaceholder),
      "rocky",
    );
    await userEvent.click(
      screen.getByRole("button", { name: t.cellSaveNotes }),
    );
    await waitFor(() =>
      expect(api.setCellNotes).toHaveBeenCalledWith(PROP, H3, "rocky"),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("uploads a cell photo with the cell target params", async () => {
    vi.mocked(api.uploadPhoto).mockResolvedValue(photo());
    renderSheet();
    await screen.findByText(t.cellNoPlants);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(["b"], "spot.jpg", { type: "image/jpeg" }),
    );
    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalled());
    expect(vi.mocked(api.uploadPhoto).mock.calls[0][0]).toMatchObject({
      cellPropertyId: PROP,
      cellH3: H3,
    });
  });

  it("shows existing photos and cell metadata", async () => {
    vi.mocked(api.getCell).mockResolvedValue(
      detail({ notes: "heavy shade", photos: [photo()] }),
    );
    renderSheet();
    expect(await screen.findByText('"before planting"')).toBeInTheDocument();
    expect(screen.getByText(t.cellDetailsTitle)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { onClose } = renderSheet();
    await screen.findByText(t.cellNoPlants);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error when loading fails", async () => {
    vi.mocked(api.getCell).mockReturnValue(
      rejected(new ApiCallError("nope", 500)),
    );
    renderSheet();
    expect(await screen.findByText(t.failedToLoad)).toBeInTheDocument();
  });
});
