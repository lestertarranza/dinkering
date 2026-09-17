/** Client-side image shrink so phone photos do not blow the server action body limit. */

export const AVATAR_MAX_EDGE = 640;
export const PROOF_MAX_EDGE = 1600;
export const COMPRESSED_MAX_BYTES = 900 * 1024;

export function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width, height };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type CompressResult = { file: File } | { error: string };

async function blobFromCanvas(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

/**
 * Decode, resize, and JPEG-compress a photo. If the browser cannot decode it
 * (some HEIC files), fall back to the original only when it is already small.
 */
export async function compressImageFile(
  file: File,
  opts: { maxEdge: number; quality?: number; maxBytes?: number } = {
    maxEdge: AVATAR_MAX_EDGE,
  },
): Promise<CompressResult> {
  const maxBytes = opts.maxBytes ?? COMPRESSED_MAX_BYTES;
  const quality = opts.quality ?? 0.82;
  if (!file || file.size === 0) return { file };

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }

  if (!bitmap) {
    if (file.size > maxBytes) {
      return {
        error:
          "This photo is too large or not a regular picture. Skip the photo, or pick a smaller JPG or PNG.",
      };
    }
    return { file };
  }

  const size = scaledSize(bitmap.width, bitmap.height, opts.maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return {
      error: "Could not process the photo. Skip it, or try another picture.",
    };
  }
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  let blob = await blobFromCanvas(canvas, quality);
  if (blob && blob.size > maxBytes) {
    blob = await blobFromCanvas(canvas, 0.7);
  }
  if (blob && blob.size > maxBytes) {
    blob = await blobFromCanvas(canvas, 0.55);
  }
  if (!blob || blob.size > maxBytes) {
    return {
      error:
        "This photo is still too large after shrinking. Skip the photo for now.",
    };
  }
  return {
    file: new File([blob], "photo.jpg", { type: "image/jpeg" }),
  };
}

/** Replace a file input on a form with a compressed JPEG, in place. */
export async function prepareImageField(
  form: HTMLFormElement,
  fieldName: string,
  opts: { maxEdge: number; quality?: number; maxBytes?: number },
): Promise<string | null> {
  const input = form.elements.namedItem(fieldName);
  if (!(input instanceof HTMLInputElement) || input.type !== "file") {
    return null;
  }
  const file = input.files?.[0];
  if (!file || file.size === 0) return null;
  const result = await compressImageFile(file, opts);
  if ("error" in result) return result.error;
  const dt = new DataTransfer();
  dt.items.add(result.file);
  input.files = dt.files;
  return null;
}

export function prepareAvatarField(form: HTMLFormElement): Promise<string | null> {
  return prepareImageField(form, "photo", {
    maxEdge: AVATAR_MAX_EDGE,
    quality: 0.82,
    maxBytes: COMPRESSED_MAX_BYTES,
  });
}

export function prepareProofField(form: HTMLFormElement): Promise<string | null> {
  return prepareImageField(form, "proof", {
    maxEdge: PROOF_MAX_EDGE,
    quality: 0.8,
    maxBytes: COMPRESSED_MAX_BYTES,
  });
}
