"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export async function updateGcashNumber(formData: FormData) {
  const gcash_number = String(formData.get("gcash_number") || "").trim() || null;
  const { supabase } = await requireAdmin();
  await supabase
    .from("app_settings")
    .update({ gcash_number })
    .eq("id", true);
  revalidatePath("/admin/collections");
}
