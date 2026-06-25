import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Upload a payment confirmation screenshot to Supabase Storage.
 * Returns the public URL, or null if no file / upload failed.
 * Uses the service-role client so it bypasses RLS.
 */
export async function uploadPaymentScreenshot(
  file: File | null | undefined,
  paymentCode: string,
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeName = `${paymentCode}-${Date.now()}.${ext}`;
  const path = `payments/${safeName}`;

  const db = createAdminClient();
  const { data, error } = await db.storage
    .from("payment-screenshots")
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (error || !data?.path) {
    console.error("[payment-screenshot] upload failed:", error?.message);
    return null;
  }

  const { data: urlData } = db.storage
    .from("payment-screenshots")
    .getPublicUrl(data.path);

  return urlData.publicUrl ?? null;
}
