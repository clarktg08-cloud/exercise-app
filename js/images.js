// Photo downscaling, kept in its own module so tests can import it without
// booting the app: app.js opens IndexedDB and renders on import.

// A phone photo is 3-12MB. Stored raw, a few dozen would dwarf the training
// history sharing this database and put it at real risk of eviction. Bounded
// to PHOTO_MAX_PX on the long edge and re-encoded as JPEG, each one lands
// around 100-200KB — still sharp enough to check a setup on a phone.
export const PHOTO_MAX_PX = 1000;
export const PHOTO_QUALITY = 0.8;

export async function downscaleImage(file) {
  // imageOrientation is explicit: phone cameras record rotation in EXIF rather
  // than rotating the pixels, and a sideways photo would be stored sideways
  // for good — the rotation is baked in here and never re-derived.
  //
  // Measured 2026-09-04 (Chromium 141): this engine applies EXIF orientation
  // to a JPEG blob no matter what this argument says — even 'none' rotates —
  // so the argument is a NO-OP there and tests/orientation.html cannot prove
  // it does anything. It stays because the spec default was 'none' before
  // 2021 and older Safari/Firefox honour it; on those engines dropping it is
  // the difference between upright and sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  // bitmap.width/height are the ORIENTED dimensions: for a photo tagged 6 or 8
  // they are the transpose of what the JPEG's own SOF header reports.
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', PHOTO_QUALITY));
  if (!blob) throw new Error('could not encode image');
  return { blob, width: w, height: h };
}
