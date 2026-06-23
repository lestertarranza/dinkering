import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveWalletOwner,
  splitByUnits,
  type WalletOwner,
} from "@/lib/ledger";

type ShareRow = {
  player_id: string;
  share_units: number;
  override_share_amount: number | null;
};

type BookingRecord = {
  id: string;
  play_date: string;
  booking_code: string | null;
  total_booking_cost: number;
};

type TeamExpenseRecord = {
  id: string;
  purchase_date: string;
  expense_code: string | null;
  description: string;
  total_cost: number;
  paid_by_player_id: string | null;
  paid_by_group_id: string | null;
};

function toRpcRow(
  row: ShareRow,
  amount: number,
  owner: WalletOwner,
  groupId: string | null,
) {
  return {
    player_id: row.player_id,
    player_group_id: groupId,
    share_units: row.share_units,
    override_share_amount: row.override_share_amount,
    amount_owed: amount,
    ledger_player_id: owner.player_id,
    ledger_group_id: owner.player_group_id,
  };
}

/** Atomically void, delete, and recreate booking shares + ledger entries. */
export async function rebuildBookingSharesAtomic(
  db: SupabaseClient,
  booking: BookingRecord,
  rows: ShareRow[],
) {
  if (rows.length === 0) {
    const { error } = await db.rpc("rebuild_booking_shares_atomic", {
      p_booking_id: booking.id,
      p_play_date: booking.play_date,
      p_booking_code: booking.booking_code,
      p_rows: [],
    });
    if (error) throw error;
    return;
  }

  const allocations = splitByUnits(rows, Number(booking.total_booking_cost));
  const rpcRows = [];
  for (const { row, amount } of allocations) {
    const owner = await resolveWalletOwner(db, row.player_id, booking.play_date);
    rpcRows.push(toRpcRow(row, amount, owner, owner.player_group_id));
  }

  const { error } = await db.rpc("rebuild_booking_shares_atomic", {
    p_booking_id: booking.id,
    p_play_date: booking.play_date,
    p_booking_code: booking.booking_code,
    p_rows: rpcRows,
  });
  if (error) throw error;
}

/** Atomically void, delete, and recreate expense shares + ledger entries. */
export async function rebuildExpenseSharesAtomic(
  db: SupabaseClient,
  expense: TeamExpenseRecord,
  rows: ShareRow[],
) {
  let creditPlayer = expense.paid_by_player_id;
  let creditGroup = expense.paid_by_group_id;
  if (expense.paid_by_player_id) {
    const owner = await resolveWalletOwner(
      db,
      expense.paid_by_player_id,
      expense.purchase_date,
    );
    creditPlayer = owner.player_id;
    creditGroup = owner.player_group_id;
  }

  const label = expense.expense_code ?? expense.description;
  const rpcRows = [];

  if (rows.length > 0) {
    const allocations = splitByUnits(rows, Number(expense.total_cost));
    for (const { row, amount } of allocations) {
      const owner = await resolveWalletOwner(
        db,
        row.player_id,
        expense.purchase_date,
      );
      rpcRows.push(toRpcRow(row, amount, owner, owner.player_group_id));
    }
  }

  const { error } = await db.rpc("rebuild_expense_shares_atomic", {
    p_expense_id: expense.id,
    p_purchase_date: expense.purchase_date,
    p_expense_label: label,
    p_total_cost: Number(expense.total_cost),
    p_credit_player_id: creditPlayer,
    p_credit_group_id: creditGroup,
    p_rows: rpcRows,
  });
  if (error) throw error;
}
