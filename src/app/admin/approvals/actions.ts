"use server";

import { requireAdmin } from "@/lib/auth";
import {
  approveAccountRequest,
  rejectAccountRequest,
} from "@/lib/accounts";
import { actionErr, actionOk, type ActionState } from "@/lib/action-state";
import { revalidatePath } from "next/cache";

export async function approveRequest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return actionErr("Missing request.");
  const result = await approveAccountRequest(id, user);
  if (!result.ok) return actionErr(result.error);
  revalidatePath("/admin/approvals");
  return actionOk("Approved.");
}

export async function rejectRequest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAdmin();
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!id) return actionErr("Missing request.");
  const result = await rejectAccountRequest(id, user, reason);
  if (!result.ok) return actionErr(result.error);
  revalidatePath("/admin/approvals");
  return actionOk("Rejected.");
}
