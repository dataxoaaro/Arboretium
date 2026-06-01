// ARB-120: Read EXIF taken_at, then canvas-resize the image to ≤2048 px
// (long edge). Re-encoding to JPEG drops EXIF, which is what we want — we
// preserve only the timestamp deliberately.

import exifr from "exifr";

const MAX_LONG_EDGE = 2048;
const OUTPUT_QUALITY = 0.85;

export interface PreparedPhoto {
  blob: Blob;
  mimeType: string;
  takenAt: number | null;
  width: number;
  height: number;
}

/**
 * Reads the EXIF DateTimeOriginal (or fallback CreateDate) and returns it
 * as Unix epoch milliseconds. Returns null if no EXIF or the field is
 * missing / unparseable.
 */
export async function readTakenAt(file: File): Promise<number | null> {
  try {
    const data = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
    if (!data) return null;
    const dt: Date | string | undefined =
      data.DateTimeOriginal ?? data.CreateDate;
    if (!dt) return null;
    const t = dt instanceof Date ? dt.getTime() : Date.parse(String(dt));
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Resize a user-supplied image to ≤2048 px on the long edge and re-encode
 * as JPEG. Returns the resized blob plus the EXIF timestamp from the
 * original (the resized blob has no EXIF).
 *
 * Throws if the file isn't decodable as an image.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const takenAt = await readTakenAt(file);

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error("Could not decode image");
  }

  const long = Math.max(bitmap.width, bitmap.height);
  const scale = long > MAX_LONG_EDGE ? MAX_LONG_EDGE / long : 1;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });

  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await canvasToJpeg(canvas);
  return {
    blob,
    mimeType: "image/jpeg",
    takenAt,
    width,
    height,
  };
}

async function canvasToJpeg(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({
      type: "image/jpeg",
      quality: OUTPUT_QUALITY,
    });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      OUTPUT_QUALITY,
    );
  });
}
