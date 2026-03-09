/** Convert a Blob to a raw base64 string (no data URI prefix). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUri = await blobToDataUri(blob);
  return dataUri.split(",")[1] ?? "";
}

/** Convert a Blob to a full data URI (data:image/...;base64,...). */
export async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read blob as data URI"));
    reader.readAsDataURL(blob);
  });
}

/** Get the natural width and height of an image Blob. */
export function getImageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for dimensions"));
    };
    img.src = url;
  });
}

/** Map a Blob's MIME type to a supported image type for APIs. */
export function mediaType(
  blob: Blob,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const t = blob.type;
  if (t === "image/png") return "image/png";
  if (t === "image/gif") return "image/gif";
  if (t === "image/webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Crop a region from an image blob using Canvas.
 * bbox is [x, y, width, height] as fractions of image dimensions (0-1).
 */
export async function cropImage(
  imageBlob: Blob,
  bbox: [number, number, number, number],
): Promise<Blob> {
  const img = await createImageBitmap(imageBlob);
  const [fx, fy, fw, fh] = bbox;
  const sx = Math.round(fx * img.width);
  const sy = Math.round(fy * img.height);
  const sw = Math.round(fw * img.width);
  const sh = Math.round(fh * img.height);

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.convertToBlob({ type: "image/png" });
}
