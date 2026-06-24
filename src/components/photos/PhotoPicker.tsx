// Photo input with two explicit choices: take a photo (camera) or choose from
// the gallery. The camera button uses capture="environment"; the gallery button
// omits capture so it never forces the camera. Shared by the plant timeline and
// the cell sheet.

import { t } from "../../lib/strings";

interface PhotoPickerProps {
  onFile: (file: File) => void;
  uploading?: boolean;
  className?: string;
}

// iOS converts HEIC gallery picks to JPEG when the accept list excludes HEIC, so
// canvas resizing in preparePhoto stays reliable across browsers.
const ACCEPT = "image/jpeg,image/png,image/webp";

const BTN =
  "flex-1 min-h-12 px-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-black/[0.03] inline-flex items-center justify-center gap-2 font-medium cursor-pointer disabled:opacity-60";

export function PhotoPicker({
  onFile,
  uploading,
  className,
}: PhotoPickerProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = "";
  }

  return (
    <div className={`flex gap-2 ${className ?? ""}`}>
      <label className={BTN} aria-disabled={uploading}>
        <span aria-hidden>📷</span>
        {uploading ? t.photoUploading : t.photoTakePhoto}
        <input
          type="file"
          accept={ACCEPT}
          capture="environment"
          disabled={uploading}
          onChange={handleChange}
          className="hidden"
        />
      </label>
      <label className={BTN} aria-disabled={uploading}>
        <span aria-hidden>🖼️</span>
        {t.photoFromGallery}
        <input
          type="file"
          accept={ACCEPT}
          disabled={uploading}
          onChange={handleChange}
          className="hidden"
        />
      </label>
    </div>
  );
}
