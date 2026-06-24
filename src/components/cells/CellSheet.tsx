// ARB-142..145: Cell (hex) detail bottom sheet.
//
// Opens when a hex is tapped on the map. Shows everything anchored to the
// spot: the plants in it, free-text notes about the location, and cell photos
// (e.g. "this corner before planting"). Big, clearly-labelled actions —
// designed for one-handed phone use by older users.

import { useCallback, useEffect, useState } from "react";
import { api, type CellDetail, type Photo, type Plant } from "../../lib/api";
import { preparePhoto } from "../../lib/photos";
import {
  parentCell,
  cellCenter,
  RES_GROUP,
  RES_ZONE,
  RES_WIDE,
} from "../../lib/h3";
import { Button } from "../ui/Button";
import { PhotoPicker } from "../photos/PhotoPicker";
import { t } from "../../lib/strings";

interface CellSheetProps {
  open: boolean;
  propertyId: string | null;
  h3: string | null;
  onClose: () => void;
  /** Tap a plant in this cell → open its detail. */
  onOpenPlant: (plant: Plant) => void;
  /** "Add a plant here" → open the plant form for this hex. */
  onAddPlant: (h3: string) => void;
  /** Notes/photos changed → let the map refresh its annotated-cell overlay. */
  onChanged: () => void;
}

export function CellSheet({
  open,
  propertyId,
  h3,
  onClose,
  onOpenPlant,
  onAddPlant,
  onChanged,
}: CellSheetProps) {
  const [detail, setDetail] = useState<CellDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!propertyId || !h3) return;
    try {
      setError(null);
      setDetail(await api.getCell(propertyId, h3));
    } catch {
      setError(t.failedToLoad);
    }
  }, [propertyId, h3]);

  useEffect(() => {
    if (open) {
      setDetail(null);
      void load();
    }
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !propertyId || !h3) return null;

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
        aria-label={t.cellTitle}
        // Mobile: a bottom sheet (max 85vh) so the map stays visible above it.
        // sm+: a full-height right drawer.
        className="fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl border-t sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:border-t-0 sm:border-l bg-[var(--color-bg)] z-50 shadow-2xl border-[var(--color-border)] flex flex-col"
      >
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-xl font-semibold font-[family-name:var(--font-display)]">
            {t.cellTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="min-h-12 min-w-12 -mr-2 rounded-full text-2xl text-muted hover:bg-black/5 inline-flex items-center justify-center"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 pb-safe">
          {error && (
            <div className="border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!detail && !error && <p className="text-muted">{t.loading}</p>}

          {detail && (
            <>
              <PlantsSection
                plants={detail.plants}
                onOpenPlant={onOpenPlant}
                onAddPlant={() => onAddPlant(h3)}
              />
              <NotesSection
                propertyId={propertyId}
                h3={h3}
                notes={detail.notes}
                onSaved={() => {
                  void load();
                  onChanged();
                }}
              />
              <PhotosSection
                propertyId={propertyId}
                h3={h3}
                photos={detail.photos}
                onChanged={() => {
                  void load();
                  onChanged();
                }}
              />
              <CellMeta h3={h3} />
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function PlantsSection({
  plants,
  onOpenPlant,
  onAddPlant,
}: {
  plants: Plant[];
  onOpenPlant: (p: Plant) => void;
  onAddPlant: () => void;
}) {
  return (
    <Section title={t.cellPlantsHere(plants.length)}>
      {plants.length === 0 ? (
        <p className="text-muted">{t.cellNoPlants}</p>
      ) : (
        <ul className="space-y-2">
          {plants.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenPlant(p)}
                className="w-full text-left min-h-14 px-4 py-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-black/[0.03] flex items-center gap-3"
              >
                <span
                  className="w-3 h-3 rounded-full bg-[var(--color-accent)] shrink-0"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-medium truncate">
                    {p.common_name}
                  </span>
                  {p.latin_name && (
                    <span className="block text-sm italic text-muted truncate">
                      {p.latin_name}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="primary" className="w-full" onClick={onAddPlant}>
        {t.cellAddPlantHere}
      </Button>
    </Section>
  );
}

function NotesSection({
  propertyId,
  h3,
  notes,
  onSaved,
}: {
  propertyId: string;
  h3: string;
  notes: string | null;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft.trim() !== (notes ?? "").trim();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.setCellNotes(propertyId, h3, draft);
      onSaved();
    } catch {
      setError(t.cellSaveNotesFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title={t.cellNotesTitle}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder={t.cellNotesPlaceholder}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 resize-y"
      />
      {error && <p className="text-[var(--color-danger)] text-sm">{error}</p>}
      <Button
        variant="secondary"
        className="w-full"
        disabled={!dirty || saving}
        onClick={() => void save()}
      >
        {saving ? t.saving : t.cellSaveNotes}
      </Button>
    </Section>
  );
}

function PhotosSection({
  propertyId,
  h3,
  photos,
  onChanged,
}: {
  propertyId: string;
  h3: string;
  photos: Photo[];
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChosen(file: File) {
    setUploading(true);
    setError(null);
    try {
      const prepared = await preparePhoto(file);
      await api.uploadPhoto({
        blob: prepared.blob,
        mimeType: prepared.mimeType,
        cellPropertyId: propertyId,
        cellH3: h3,
        takenAt: prepared.takenAt,
        filename: file.name,
      });
      onChanged();
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
      onChanged();
    } catch {
      setError(t.photoCaptionFailed);
    }
  }

  async function remove(photo: Photo) {
    if (!confirm(t.photoDeleteConfirm)) return;
    try {
      await api.deletePhoto(photo.id);
      onChanged();
    } catch {
      setError(t.photoDeleteFailed);
    }
  }

  return (
    <Section title={t.cellPhotosTitle(photos.length)}>
      {error && <p className="text-[var(--color-danger)] text-sm">{error}</p>}
      {photos.length > 0 && (
        <ul className="space-y-3">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="rounded-2xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <img
                src={api.photoUrl(photo.id)}
                alt={photo.caption ?? "Cell photo"}
                loading="lazy"
                className="w-full max-h-72 object-cover bg-black/5"
              />
              <div className="p-3 flex items-center gap-3 flex-wrap text-sm">
                <span className="text-muted">
                  {new Date(
                    photo.taken_at ?? photo.uploaded_at,
                  ).toLocaleDateString()}
                </span>
                {photo.caption && (
                  <span className="italic">"{photo.caption}"</span>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => void recaption(photo)}
                  className="min-h-10 px-2 underline text-muted hover:text-fg"
                >
                  {t.photoCaption}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(photo)}
                  className="min-h-10 px-2 underline text-[var(--color-danger)]"
                >
                  {t.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PhotoPicker onFile={(f) => void onFileChosen(f)} uploading={uploading} />
    </Section>
  );
}

function CellMeta({ h3 }: { h3: string }) {
  // ARB-145: cell metadata. Wrapped because a fake cell id (tests / odd data)
  // would otherwise throw inside h3-js.
  let center: [number, number] | null = null;
  let parents: { res: number; cell: string }[] = [];
  try {
    center = cellCenter(h3);
    parents = [RES_GROUP, RES_ZONE, RES_WIDE].map((res) => ({
      res,
      cell: parentCell(h3, res),
    }));
  } catch {
    center = null;
  }

  return (
    <details className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <summary className="cursor-pointer font-medium text-muted">
        {t.cellDetailsTitle}
      </summary>
      <dl className="mt-3 space-y-1 text-sm">
        <Meta label={t.cellRes15} value={h3} mono />
        {parents.map((p) => (
          <Meta
            key={p.res}
            label={t.cellParentRes(p.res)}
            value={p.cell}
            mono
          />
        ))}
        {center && (
          <Meta
            label={t.cellCentre}
            value={`${center[1].toFixed(6)}, ${center[0].toFixed(6)}`}
          />
        )}
      </dl>
    </details>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all text-right" : ""}>
        {value}
      </dd>
    </div>
  );
}
