import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function uploadPaymentProof(
  file: File | null | undefined,
  ownerKey: string,
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safe = `${ownerKey}-${Date.now()}.${ext}`;
  const path = `proofs/${safe}`;
  const db = createAdminClient();
  const { data, error } = await db.storage.from("payment-proofs").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error || !data?.path) {
    console.error("[payment-proof] upload failed:", error?.message);
    return null;
  }
  const { data: urlData } = db.storage.from("payment-proofs").getPublicUrl(data.path);
  return urlData.publicUrl ?? null;
}
