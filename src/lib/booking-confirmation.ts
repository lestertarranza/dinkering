import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Upload a court booking confirmation screenshot to Supabase Storage.
 * Returns the public URL, or null if no file / upload failed.
 * Uses the service-role client so it bypasses RLS.
 */
export async function uploadBookingConfirmation(
  file: File | null | undefined,
  bookingCode: string,
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeName = `${bookingCode}-${Date.now()}.${ext}`;
  const path = `confirmations/${safeName}`;

  const db = createAdminClient();
  const { data, error } = await db.storage
    .from("booking-confirmations")
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (error || !data?.path) {
    console.error("[booking-confirmation] upload failed:", error?.message);
    return null;
  }

  const { data: urlData } = db.storage
    .from("booking-confirmations")
    .getPublicUrl(data.path);

  return urlData.publicUrl ?? null;
}
