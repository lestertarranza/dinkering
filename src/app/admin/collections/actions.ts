"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { actionOk, type ActionState } from "@/lib/action-state";

export async function updateGcashNumber(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gcash_number = String(formData.get("gcash_number") || "").trim() || null;
  const { supabase } = await requireAdmin();
  await supabase
    .from("app_settings")
    .update({ gcash_number })
    .eq("id", true);
  revalidatePath("/admin/collections");
  return actionOk(
    gcash_number
      ? "GCash number saved — it will appear in payment reminders."
      : "GCash number cleared.",
  );
}
