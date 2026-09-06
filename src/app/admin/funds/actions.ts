"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/format";
import { round2 } from "@/lib/ledger";
import { fundBalanceFromEntries } from "@/lib/club-funds";

function revalidateFunds(id?: string) {
  revalidatePath("/admin/funds");
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/funds/${id}`);
}

async function remainingForFund(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  fundId: string,
): Promise<number> {
  const { data } = await supabase
    .from("club_fund_entries")
    .select("kind, amount, voided")
    .eq("fund_id", fundId);
  return fundBalanceFromEntries(
    (data ?? []) as { kind: string; amount: number; voided: boolean }[],
  );
}

export async function createFund(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const notes = String(formData.get("notes") || "").trim() || null;
  const targetRaw = String(formData.get("target_amount") || "").trim();
  const target_amount = targetRaw ? Math.abs(parseFloat(targetRaw)) : null;

  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("club_item_funds")
    .insert({
      name,
      notes,
      target_amount:
        target_amount && Number.isFinite(target_amount) && target_amount > 0
          ? round2(target_amount)
          : null,
    })
    .select("id")
    .single();

  revalidateFunds();
  if (data?.id) redirect(`/admin/funds/${data.id}`);
}

export async function updateFund(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) return actionErr("Name is required.");
  const notes = String(formData.get("notes") || "").trim() || null;
  const targetRaw = String(formData.get("target_amount") || "").trim();
  const targetParsed = targetRaw ? Math.abs(parseFloat(targetRaw)) : null;
  const target_amount =
    targetParsed && Number.isFinite(targetParsed) && targetParsed > 0
      ? round2(targetParsed)
      : null;
  const status = String(formData.get("status") || "active");

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("club_item_funds")
    .update({
      name,
      notes,
      target_amount,
      status: status === "archived" ? "archived" : "active",
    })
    .eq("id", id);
  if (error) return actionErr(error.message);
  revalidateFunds(id);
  return actionOk("Fund saved.");
}

export async function addFundEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const fund_id = String(formData.get("fund_id") || "");
  const kind = String(formData.get("kind") || "");
  if (!fund_id || (kind !== "allocate" && kind !== "spend")) {
    return actionErr("Choose add money or a purchase.");
  }
  const amount = round2(Math.abs(parseFloat(String(formData.get("amount") || "0"))));
  if (!Number.isFinite(amount) || amount <= 0) {
    return actionErr("Enter an amount greater than zero.");
  }
  const entry_date =
    String(formData.get("entry_date") || "") ||
    new Date().toISOString().slice(0, 10);
  const description = String(formData.get("description") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const team_expense_id = String(formData.get("team_expense_id") || "") || null;

  const { supabase } = await requireAdmin();

  if (kind === "spend") {
    const remaining = await remainingForFund(supabase, fund_id);
    if (amount > remaining + 0.005) {
      return actionErr(
        `Only ${formatMoney(remaining)} left in this fund. Add money first, or enter a smaller purchase.`,
      );
    }
  }

  const { error } = await supabase.from("club_fund_entries").insert({
    fund_id,
    kind,
    amount,
    entry_date,
    description:
      description ||
      (kind === "allocate" ? "Set aside" : "Purchase"),
    notes,
    team_expense_id,
  });
  if (error) return actionErr(error.message);
  revalidateFunds(fund_id);
  return actionOk(kind === "allocate" ? "Money added to this fund." : "Purchase deducted.");
}

export async function voidFundEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const fund_id = String(formData.get("fund_id") || "");
  if (!id) return actionErr("Missing entry.");
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("club_fund_entries")
    .update({ voided: true })
    .eq("id", id)
    .eq("voided", false);
  if (error) return actionErr(error.message);
  revalidateFunds(fund_id);
  return actionOk("Entry voided. Balance updated.");
}
