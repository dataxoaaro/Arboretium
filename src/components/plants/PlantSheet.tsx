// ARB-104..106: A right-side sheet that handles add / edit / info display
// for plants. Driven by `mode`:
//   create — empty form, saves with POST /plants
//   edit   — pre-filled form, saves with PATCH /plants/:id
//   info   — read-only view + Edit / Delete actions
//
// Closed by tapping the backdrop, pressing Escape, or the close button.

import { useEffect, useState, type FormEvent } from "react";
import { api, type Photo, type Plant, type PlantInput } from "../../lib/api";
import { preparePhoto } from "../../lib/photos";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  CATEGORIES,
  PALETTE,
  categoryOf,
  type CategoryKey,
} from "../../lib/categories";
import { t } from "../../lib/strings";

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
  /** "Move to another cell" — parent puts the map into pick-a-cell mode. */
  onMove: (plant: Plant) => void;
}

export function PlantSheet({
  open,
  mode,
  onClose,
  onSaved,
  onDeleted,
  onMove,
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
            onMove={() => onMove(mode.plant)}
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
  onMove,
}: {
  plant: Plant;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: (id: string) => void;
  onMove: () => void;
}) {
  const [tab, setTab] = useState<"info" | "timeline">("info");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cat = categoryOf(plant.category);
  const isKasvi = cat.key === "kasvi";

  async function doDelete() {
    setBusy(true);
    try {
      await api.deletePlant(plant.id);
      onDeleted(plant.id);
    } catch {
      setError(t.plantDeleteFailed);
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <SheetHeader title={plant.common_name} onClose={onClose} />
      <div className="flex border-b border-black/10 text-sm">
        <TabButton active={tab === "info"} onClick={() => setTab("info")}>
          {t.plantTabInfo}
        </TabButton>
        <TabButton
          active={tab === "timeline"}
          onClick={() => setTab("timeline")}
        >
          {t.plantTabTimeline}
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
            <Field label={t.plantCategory}>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>{cat.icon}</span>
                {cat.label}
              </span>
            </Field>
            <Field label={t.plantCommonName}>{plant.common_name}</Field>
            {isKasvi && (
              <>
                <Field label={t.plantLatinName}>
                  {plant.latin_name ?? "—"}
                </Field>
                <Field label={t.plantType}>{plant.plant_type ?? "—"}</Field>
                <Field label={t.plantPlanted}>
                  {plant.planted_date ?? "—"}
                </Field>
              </>
            )}
            <Field label={t.plantSource}>{plant.source ?? "—"}</Field>
            <Field label={t.plantNotes}>
              {plant.notes ? (
                <p className="whitespace-pre-wrap">{plant.notes}</p>
              ) : (
                "—"
              )}
            </Field>
            <Field label={t.plantCell}>
              <code className="font-mono text-xs">{plant.h3_res15}</code>
            </Field>
            <Field label={t.plantPosition}>
              {plant.lat.toFixed(6)}, {plant.lng.toFixed(6)}
            </Field>
            <Field label={t.plantCreated}>
              {new Date(plant.created_at).toLocaleString()}
            </Field>
            <Field label={t.plantUpdated}>
              {new Date(plant.updated_at).toLocaleString()}
            </Field>
          </>
        )}
        {tab === "timeline" && <PhotoTimeline plant={plant} />}
      </div>
      <SheetFooter>
        <Button
          variant="danger"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
        >
          {t.delete}
        </Button>
        <Button variant="ghost" onClick={onMove} disabled={busy}>
          {t.plantMove}
        </Button>
        <div className="flex-1" />
        <Button variant="primary" size="lg" onClick={onEdit}>
          {t.edit}
        </Button>
      </SheetFooter>
      <ConfirmDialog
        open={confirmOpen}
        title={t.plantDeleteConfirm(plant.common_name)}
        message={t.plantDeleteRecoverable}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        danger
        busy={busy}
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
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
    } catch {
      setError(t.photoLoadFailed);
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
    } catch {
      setError(t.photoUploadFailed);
    } finally {
      setUploading(false);
    }
  }

  async function recaption(photo: Photo) {
    const next = prompt(t.photoCaptionPrompt, photo.caption ?? "");
    if (next === null) return;
    try {
      await api.updatePhoto(photo.id, next.trim() || null);
      await load();
    } catch {
      setError(t.photoCaptionFailed);
    }
  }

  async function deletePhoto(photo: Photo) {
    if (!confirm(t.photoDeleteConfirm)) return;
    try {
      await api.deletePhoto(photo.id);
      await load();
    } catch {
      setError(t.photoDeleteFailed);
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
          {uploading ? t.photoUploading : t.photoAdd}
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
          {sortDir === "asc" ? t.photoOldestFirst : t.photoNewestFirst}
        </button>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {sorted === null && <p className="text-xs text-fg/60">{t.loading}</p>}
      {sorted && sorted.length === 0 && (
        <p className="text-xs text-fg/60">{t.photoNone}</p>
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
                    <span className="text-fg/40"> {t.photoUploadTime}</span>
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
                  {t.photoCaption}
                </button>
                <button
                  type="button"
                  onClick={() => void deletePhoto(photo)}
                  className="underline text-[var(--color-danger)]"
                >
                  {t.delete}
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

  const [category, setCategory] = useState<CategoryKey>(
    categoryOf(initial?.category).key,
  );
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [commonName, setCommonName] = useState(initial?.common_name ?? "");
  const [latinName, setLatinName] = useState(initial?.latin_name ?? "");
  const [plantType, setPlantType] = useState(initial?.plant_type ?? "");
  const [plantedDate, setPlantedDate] = useState(initial?.planted_date ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isKasvi = category === "kasvi";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!commonName.trim()) {
      setError(t.plantCommonNameRequired);
      return;
    }
    setSubmitting(true);
    try {
      let saved: Plant;
      // Plant-only fields are cleared for non-Kasvi categories.
      const latin = isKasvi ? latinName.trim() || null : null;
      const type = isKasvi ? plantType.trim() || null : null;
      const planted = isKasvi ? plantedDate.trim() || null : null;
      if (isEdit && initial) {
        saved = await api.updatePlant(initial.id, {
          common_name: commonName.trim(),
          latin_name: latin,
          plant_type: type,
          planted_date: planted,
          source: source.trim() || null,
          notes: notes.trim() || null,
          category,
          color,
        });
      } else {
        const create = mode as Extract<PlantSheetMode, { kind: "create" }>;
        const input: PlantInput = {
          property_id: create.propertyId,
          h3_res15: create.cell,
          lat: create.lat,
          lng: create.lng,
          common_name: commonName.trim(),
          latin_name: latin,
          plant_type: type,
          planted_date: planted,
          source: source.trim() || null,
          notes: notes.trim() || null,
          category,
          color,
        };
        saved = await api.createPlant(input);
      }
      onSaved(saved);
    } catch {
      setError(t.plantSaveFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SheetHeader
        title={isEdit ? t.plantEditTitle : t.plantAddTitle}
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
              {t.plantCellLabel}{" "}
              <code className="font-mono">
                {(mode as Extract<PlantSheetMode, { kind: "create" }>).cell}
              </code>
            </p>
          )}
          <div>
            <div className="text-xs font-medium text-fg/70 mb-1">
              {t.plantCategory}
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setCategory(c.key);
                    setColor(null);
                  }}
                  aria-pressed={category === c.key}
                  className={`min-h-11 px-3 rounded-xl border inline-flex items-center gap-1.5 ${
                    category === c.key
                      ? "border-[var(--color-accent)] bg-black/[0.04] font-medium"
                      : "border-[var(--color-border)] hover:bg-black/[0.03]"
                  }`}
                >
                  <span aria-hidden>{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-fg/70 mb-1">
              {t.plantColor}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setColor(null)}
                aria-pressed={color === null}
                className={`min-h-11 px-3 rounded-xl border text-xs inline-flex items-center gap-1.5 ${
                  color === null
                    ? "border-[var(--color-accent)] font-medium"
                    : "border-[var(--color-border)]"
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-black/10"
                  style={{ backgroundColor: categoryOf(category).color }}
                />
                {t.plantColorDefault}
              </button>
              {PALETTE.map((sw) => (
                <button
                  key={sw}
                  type="button"
                  onClick={() => setColor(sw)}
                  aria-label={sw}
                  aria-pressed={color === sw}
                  className={`w-10 h-10 rounded-full border-2 ${
                    color === sw
                      ? "border-[var(--color-fg)]"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: sw }}
                />
              ))}
            </div>
          </div>
          <FormField label={t.plantCommonNameField}>
            <input
              required
              autoFocus
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              className={inputClass}
            />
          </FormField>
          {isKasvi && (
            <>
              <FormField label={t.plantLatinName}>
                <input
                  value={latinName ?? ""}
                  onChange={(e) => setLatinName(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label={t.plantType}>
                <input
                  value={plantType ?? ""}
                  onChange={(e) => setPlantType(e.target.value)}
                  placeholder={t.plantTypePlaceholder}
                  className={inputClass}
                />
              </FormField>
              <FormField label={t.plantPlantedField}>
                <input
                  value={plantedDate ?? ""}
                  onChange={(e) => setPlantedDate(e.target.value)}
                  className={inputClass}
                />
              </FormField>
            </>
          )}
          <FormField label={t.plantSource}>
            <input
              value={source ?? ""}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t.plantSourcePlaceholder}
              className={inputClass}
            />
          </FormField>
          <FormField label={t.plantNotes}>
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
            {t.cancel}
          </Button>
          <div className="flex-1" />
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? t.saving : t.save}
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
        aria-label={t.close}
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
