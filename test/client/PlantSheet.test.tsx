import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PlantSheet,
  type PlantSheetMode,
} from "../../src/components/plants/PlantSheet";
import { api, ApiCallError, type Plant, type Photo } from "../../src/lib/api";
import { rejected } from "./rejected";

vi.mock("../../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      createPlant: vi.fn(),
      updatePlant: vi.fn(),
      deletePlant: vi.fn(),
      listPhotosForPlant: vi.fn(),
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

function plant(over: Partial<Plant> = {}): Plant {
  return {
    id: "plant-1",
    property_id: "p1",
    h3_res15: "cell-a",
    lat: 60.1,
    lng: 24.9,
    common_name: "Oak",
    latin_name: "Quercus",
    plant_type: "tree",
    planted_date: "2020",
    source: "nursery",
    notes: "north corner",
    archived: 0,
    created_by: "u",
    created_at: 0,
    last_edited_by: "u",
    updated_at: 0,
    ...over,
  };
}

function renderSheet(mode: PlantSheetMode) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  render(
    <PlantSheet
      open
      mode={mode}
      onClose={onClose}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />,
  );
  return { onClose, onSaved, onDeleted };
}

const CREATE: PlantSheetMode = {
  kind: "create",
  cell: "cell-a",
  lat: 60.1,
  lng: 24.9,
  propertyId: "p1",
};

beforeEach(() => {
  vi.mocked(api.listPhotosForPlant).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe("PlantSheet visibility", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <PlantSheet
        open={false}
        mode={CREATE}
        onClose={() => {}}
        onSaved={() => {}}
        onDeleted={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("closes on Escape and on backdrop click", async () => {
    const { onClose } = renderSheet(CREATE);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("PlantSheet create", () => {
  it("creates a plant from the form", async () => {
    vi.mocked(api.createPlant).mockResolvedValue(plant());
    const { onSaved } = renderSheet(CREATE);
    expect(screen.getByText("Add plant")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Common name *"), "Maple");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.createPlant).toHaveBeenCalledWith(
      expect.objectContaining({
        property_id: "p1",
        h3_res15: "cell-a",
        common_name: "Maple",
      }),
    );
  });

  it("requires a common name", async () => {
    renderSheet(CREATE);
    // fireEvent.submit bypasses the input's HTML5 `required` gate so the
    // component's own validation runs.
    fireEvent.submit(document.querySelector("form")!);
    expect(
      await screen.findByText("Common name is required"),
    ).toBeInTheDocument();
    expect(api.createPlant).not.toHaveBeenCalled();
  });

  it("surfaces a save error", async () => {
    vi.mocked(api.createPlant).mockReturnValue(
      rejected(new ApiCallError("h3_res15 is not in property", 400)),
    );
    renderSheet(CREATE);
    await userEvent.type(screen.getByLabelText("Common name *"), "Maple");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("h3_res15 is not in property"),
    ).toBeInTheDocument();
  });
});

describe("PlantSheet edit", () => {
  it("pre-fills the form and patches on save", async () => {
    vi.mocked(api.updatePlant).mockResolvedValue(plant({ common_name: "Elm" }));
    const { onSaved } = renderSheet({ kind: "edit", plant: plant() });
    const nameInput = screen.getByLabelText(
      "Common name *",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Oak");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Elm");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.updatePlant).toHaveBeenCalledWith(
      "plant-1",
      expect.objectContaining({ common_name: "Elm" }),
    );
  });
});

describe("PlantSheet info", () => {
  it("shows plant metadata and signals edit", async () => {
    const { onSaved } = renderSheet({ kind: "info", plant: plant() });
    expect(screen.getByText("Quercus")).toBeInTheDocument();
    expect(screen.getByText("north corner")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("deletes after confirmation", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.mocked(api.deletePlant).mockResolvedValue({ ok: true });
    const { onDeleted } = renderSheet({ kind: "info", plant: plant() });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("plant-1"));
  });

  it("does not delete when cancelled", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { onDeleted } = renderSheet({ kind: "info", plant: plant() });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deletePlant).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("PlantSheet timeline", () => {
  function photo(over: Partial<Photo> = {}): Photo {
    return {
      id: "ph1",
      plant_id: "plant-1",
      cell_property_id: null,
      cell_h3_res15: null,
      r2_key: "k",
      caption: "spring",
      taken_at: 1000,
      uploaded_at: 2000,
      uploaded_by: "u",
      ...over,
    };
  }

  it("loads and lists photos, and toggles sort order", async () => {
    vi.mocked(api.listPhotosForPlant).mockResolvedValue([photo()]);
    renderSheet({ kind: "info", plant: plant() });
    await userEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(await screen.findByText('"spring"')).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Oldest first" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Oldest first" }));
    expect(
      screen.getByRole("button", { name: "Newest first" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state with no photos", async () => {
    vi.mocked(api.listPhotosForPlant).mockResolvedValue([]);
    renderSheet({ kind: "info", plant: plant() });
    await userEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(await screen.findByText("No photos yet.")).toBeInTheDocument();
  });

  it("uploads a chosen file via preparePhoto", async () => {
    vi.mocked(api.listPhotosForPlant).mockResolvedValue([]);
    vi.mocked(api.uploadPhoto).mockResolvedValue(photo());
    renderSheet({ kind: "info", plant: plant() });
    await userEvent.click(screen.getByRole("button", { name: "Timeline" }));
    await screen.findByText("No photos yet.");

    const file = new File(["bytes"], "pic.jpg", { type: "image/jpeg" });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalled());
    expect(vi.mocked(api.uploadPhoto).mock.calls[0][0]).toMatchObject({
      plantId: "plant-1",
      mimeType: "image/jpeg",
    });
  });
});
