// ARB-104..106: A right-side sheet that handles add / edit / info display
// for plants. Driven by `mode`:
//   create — empty form, saves with POST /plants
//   edit   — pre-filled form, saves with PATCH /plants/:id
//   info   — read-only view + Edit / Delete actions
//
// Closed by tapping the backdrop, pressing Escape, or the close button.

import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  ApiCallError,
  type Photo,
  type Plant,
  type PlantInput,
} from "../../lib/api";
import { preparePhoto } from "../../lib/photos";
import { Button } from "../ui/Button";

export type PlantSheetMode =
  | {
      kind: "create";
      cell: string;
      lat: number;
      lng: number;
      propertyId: string;
    }
  | { kind: "edit"; plant: Plant }
  | { kind: "info"; plant: Plant };

interface PlantSheetProps {
  open: boolean;
  mode: PlantSheetMode | null;
  onClose: () => void;
  onSaved: (plant: Plant) => void;
  onDeleted: (plantId: string) => void;
}

export function PlantSheet({
  open,
  mode,
  onClose,
  onSaved,
  onDeleted,
}: PlantSheetProps) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mode) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-40"
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[440px] bg-[var(--color-bg)] z-50 shadow-2xl border-l border-[var(--color-border)] flex flex-col"
      >
        {mode.kind === "info" && (
          <PlantInfo
            plant={mode.plant}
            onClose={onClose}
            onEdit={() => onSaved(mode.plant)} // signal upward; parent flips to edit mode
            onDeleted={onDeleted}
          />
        )}
        {(mode.kind === "create" || mode.kind === "edit") && (
          <PlantForm mode={mode} onClose={onClose} onSaved={onSaved} />
        )}
      </aside>
    </>
  );
}

// ARB-105 + ARB-125/126/127: Info tab + Timeline tab. Tabs share the
// header / footer so Edit and Delete are accessible from either view.
function PlantInfo({
  plant,
  onClose,
  onEdit,
  onDeleted,
}: {
  plant: Plant;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}) {
  const [tab, setTab] = useState<"info" | "timeline">("info");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    if (!confirm(`Delete "${plant.common_name}"?`)) return;
    setBusy(true);
    try {
      await api.deletePlant(plant.id);
      onDeleted(plant.id);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetHeader title={plant.common_name} onClose={onClose} />
      <div className="flex border-b border-black/10 text-sm">
        <TabButton active={tab === "info"} onClick={() => setTab("info")}>
          Info
        </TabButton>
        <TabButton
          active={tab === "timeline"}
          onClick={() => setTab("timeline")}
        >
          Timeline
        </TabButton>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        {error && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        {tab === "info" && (
          <>
            <Field label="Common name">{plant.common_name}</Field>
            <Field label="Latin name">{plant.latin_name ?? "—"}</Field>
            <Field label="Type">{plant.plant_type ?? "—"}</Field>
            <Field label="Planted">{plant.planted_date ?? "—"}</Field>
            <Field label="Source">{plant.source ?? "—"}</Field>
            <Field label="Notes">
              {plant.notes ? (
                <p className="whitespace-pre-wrap">{plant.notes}</p>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Cell">
              <code className="font-mono text-xs">{plant.h3_res15}</code>
            </Field>
            <Field label="Position">
              {plant.lat.toFixed(6)}, {plant.lng.toFixed(6)}
            </Field>
            <Field label="Created">
              {new Date(plant.created_at).toLocaleString()}
            </Field>
            <Field label="Updated">
              {new Date(plant.updated_at).toLocaleString()}
            </Field>
          </>
        )}
        {tab === "timeline" && <PhotoTimeline plant={plant} />}
      </div>
      <SheetFooter>
        <Button variant="danger" onClick={() => void del()} disabled={busy}>
          Delete
        </Button>
        <div className="flex-1" />
        <Button variant="primary" size="lg" onClick={onEdit}>
          Edit
        </Button>
      </SheetFooter>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 px-5 text-base border-b-2 transition-colors ${
        active
          ? "border-[var(--color-accent)] font-semibold text-fg"
          : "border-transparent text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

// ARB-125/126/127: Plant photo timeline.
function PhotoTimeline({ plant }: { plant: Plant }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  async function load() {
    try {
      setError(null);
      setPhotos(await api.listPhotosForPlant(plant.id));
    } catch (err) {
      setError(
        err instanceof ApiCallError ? err.message : "Failed to load photos",
      );
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plant.id]);

  async function onFileChosen(file: File) {
    setError(null);
    setUploading(true);
    try {
      const prepared = await preparePhoto(file);
      await api.uploadPhoto({
        blob: prepared.blob,
        mimeType: prepared.mimeType,
        plantId: plant.id,
        takenAt: prepared.takenAt,
        filename: file.name,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function recaption(photo: Photo) {
    const next = prompt("Caption", photo.caption ?? "");
    if (next === null) return;
    try {
      await api.updatePhoto(photo.id, next.trim() || null);
      await load();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Update failed");
    }
  }

  async function deletePhoto(photo: Photo) {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    try {
      await api.deletePhoto(photo.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Delete failed");
    }
  }

  const sorted = photos
    ? [...photos].sort((a, b) => {
        const at = a.taken_at ?? a.uploaded_at;
        const bt = b.taken_at ?? b.uploaded_at;
        return sortDir === "asc" ? at - bt : bt - at;
      })
    : null;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <label className="min-h-12 px-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-black/[0.03] inline-flex items-center font-medium cursor-pointer">
          {uploading ? "Uploading…" : "Add photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileChosen(f);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="text-xs underline text-fg/70 hover:text-fg"
        >
          {sortDir === "asc" ? "Oldest first" : "Newest first"}
        </button>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {sorted === null && <p className="text-xs text-fg/60">Loading…</p>}
      {sorted && sorted.length === 0 && (
        <p className="text-xs text-fg/60">No photos yet.</p>
      )}

      {sorted && sorted.length > 0 && (
        <ul className="space-y-3">
          {sorted.map((photo) => (
            <li
              key={photo.id}
              className="border border-black/10 rounded-md overflow-hidden"
            >
              <img
                src={api.photoUrl(photo.id)}
                alt={photo.caption ?? plant.common_name}
                loading="lazy"
                className="w-full max-h-80 object-cover bg-black/5"
              />
              <div className="p-2 text-xs flex items-center gap-2 flex-wrap">
                <span className="text-fg/60">
                  {new Date(
                    photo.taken_at ?? photo.uploaded_at,
                  ).toLocaleString()}
                  {photo.taken_at == null && (
                    <span className="text-fg/40"> (upload time)</span>
                  )}
                </span>
                {photo.caption && (
                  <span className="text-fg/80 italic">"{photo.caption}"</span>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => void recaption(photo)}
                  className="underline text-fg/70 hover:text-fg"
                >
                  Caption
                </button>
                <button
                  type="button"
                  onClick={() => void deletePhoto(photo)}
                  className="underline text-red-700 hover:text-red-900"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ARB-104 + ARB-106: Add / edit form.
function PlantForm({
  mode,
  onClose,
  onSaved,
}: {
  mode: Extract<PlantSheetMode, { kind: "create" | "edit" }>;
  onClose: () => void;
  onSaved: (plant: Plant) => void;
}) {
  const isEdit = mode.kind === "edit";
  const initial = isEdit ? mode.plant : null;

  const [commonName, setCommonName] = useState(initial?.common_name ?? "");
  const [latinName, setLatinName] = useState(initial?.latin_name ?? "");
  const [plantType, setPlantType] = useState(initial?.plant_type ?? "");
  const [plantedDate, setPlantedDate] = useState(initial?.planted_date ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!commonName.trim()) {
      setError("Common name is required");
      return;
    }
    setSubmitting(true);
    try {
      let saved: Plant;
      if (isEdit && initial) {
        saved = await api.updatePlant(initial.id, {
          common_name: commonName.trim(),
          latin_name: latinName.trim() || null,
          plant_type: plantType.trim() || null,
          planted_date: plantedDate.trim() || null,
          source: source.trim() || null,
          notes: notes.trim() || null,
        });
      } else {
        const create = mode as Extract<PlantSheetMode, { kind: "create" }>;
        const input: PlantInput = {
          property_id: create.propertyId,
          h3_res15: create.cell,
          lat: create.lat,
          lng: create.lng,
          common_name: commonName.trim(),
          latin_name: latinName.trim() || null,
          plant_type: plantType.trim() || null,
          planted_date: plantedDate.trim() || null,
          source: source.trim() || null,
          notes: notes.trim() || null,
        };
        saved = await api.createPlant(input);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SheetHeader
        title={isEdit ? "Edit plant" : "Add plant"}
        onClose={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {error && (
            <div className="border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {!isEdit && (
            <p className="text-xs text-fg/60">
              Cell:{" "}
              <code className="font-mono">
                {(mode as Extract<PlantSheetMode, { kind: "create" }>).cell}
              </code>
            </p>
          )}
          <FormField label="Common name *">
            <input
              required
              autoFocus
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Latin name">
            <input
              value={latinName ?? ""}
              onChange={(e) => setLatinName(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Type">
            <input
              value={plantType ?? ""}
              onChange={(e) => setPlantType(e.target.value)}
              placeholder="e.g. tree, shrub, perennial"
              className={inputClass}
            />
          </FormField>
          <FormField label="Planted (free text or YYYY-MM-DD)">
            <input
              value={plantedDate ?? ""}
              onChange={(e) => setPlantedDate(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Source">
            <input
              value={source ?? ""}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Nursery, gift, self-seeded…"
              className={inputClass}
            />
          </FormField>
          <FormField label="Notes">
            <textarea
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className={`${inputClass} resize-y`}
            />
          </FormField>
        </div>
        <SheetFooter>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}

const inputClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3";

function SheetHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
      <h2 className="text-xl font-semibold truncate font-[family-name:var(--font-display)]">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="min-h-12 min-w-12 -mr-2 rounded-full text-2xl text-muted hover:bg-black/5 inline-flex items-center justify-center"
        aria-label="Close"
      >
        ✕
      </button>
    </header>
  );
}

function SheetFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="border-t border-[var(--color-border)] p-4 flex items-center gap-3 pb-safe">
      {children}
    </footer>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase text-fg/50 mb-0.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-fg/70 mb-1">{label}</div>
      {children}
    </label>
  );
}
