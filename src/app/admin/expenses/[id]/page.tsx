import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  Badge,
  buttonClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  formatMoney,
  formatDate,
  isSettled,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import { resolveWalletOwnersForPlayers, round2 } from "@/lib/ledger";
import { chargeRemainingBySource } from "@/lib/payment-allocation";
import type { Player, TeamExpense, TeamExpenseShare } from "@/lib/types";
import { regenerateExpenseShares, reverseExpense, deleteExpense } from "../actions";

export const dynamic = "force-dynamic";

const methodLabels: Record<string, string> = {
  active_players: "All active players",
  selected_players: "Selected players",
  attendees: "Booking attendees",
  custom: "Custom",
};

export default async function ExpenseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: expense } = await supabase
    .from("team_expenses")
    .select("*, players:paid_by_player_id(name), player_groups:paid_by_group_id(name)")
    .eq("id", id)
    .single();
  if (!expense) notFound();
  const e = expense as TeamExpense & {
    players: { name: string } | null;
    player_groups: { name: string } | null;
  };

  const [{ data: shares }, { data: players }] = await Promise.all([
    supabase
      .from("team_expense_shares")
      .select("*, players(id, name)")
      .eq("team_expense_id", id),
    supabase
      .from("players")
      .select("id, name")
      .eq("active_status", "active")
      .order("name"),
  ]);

  const shareList = (shares ?? []) as (TeamExpenseShare & {
    players: Pick<Player, "id" | "name"> | null;
  })[];
  const shareByPlayer = new Map(shareList.map((s) => [s.player_id, s]));
  const totalAssigned = shareList.reduce(
    (s, x) => s + Number(x.amount_owed),
    0,
  );
  const rawUnassigned = Number(e.total_cost) - totalAssigned;
  const unassigned =
    Math.abs(rawUnassigned) < SETTLE_TOLERANCE ? 0 : rawUnassigned;

  // Per-share settlement status. Within each payer's wallet we apply credits
  // and payments to charges oldest-first (FIFO), so a share covered by an
  // existing wallet credit reports as settled with no manual payment needed.
  // Wallets are resolved in one batch query and each distinct wallet's ledger
  // is read in parallel to keep this page fast.
  const remainingByShareId = new Map<string, number>();
  if (e.status !== "reversed") {
    const sharePlayerIds = [
      ...new Set(
        shareList
          .map((s) => s.player_id)
          .filter((pid): pid is string => Boolean(pid)),
      ),
    ];
    const owners = await resolveWalletOwnersForPlayers(
      supabase,
      sharePlayerIds,
      e.purchase_date,
    );
    const distinctWallets = new Map<
      string,
      { player_id: string | null; player_group_id: string | null }
    >();
    for (const owner of owners.values()) {
      const key = `${owner.player_id ?? ""}|${owner.player_group_id ?? ""}`;
      if (!distinctWallets.has(key)) distinctWallets.set(key, owner);
    }
    const walletMaps = await Promise.all(
      [...distinctWallets.values()].map((w) =>
        chargeRemainingBySource(supabase, w),
      ),
    );
    for (const map of walletMaps) {
      for (const [sid, rem] of map) remainingByShareId.set(sid, rem);
    }
  }

  const settlement = shareList.map((s) => {
    const owed = Number(s.amount_owed);
    const remaining = Math.min(owed, remainingByShareId.get(s.id) ?? 0);
    const paid = Math.max(0, round2(owed - remaining));
    return {
      share: s,
      name: s.players?.name ?? "Unknown player",
      owed,
      paid,
      remaining: round2(remaining),
    };
  });
  const totalPaid = round2(settlement.reduce((sum, x) => sum + x.paid, 0));
  const rawOutstanding = round2(
    settlement.reduce((sum, x) => sum + x.remaining, 0),
  );
  const outstanding = isSettled(rawOutstanding) ? 0 : rawOutstanding;

  // Union of active players and anyone who currently has a share.
  const candidateMap = new Map<string, string>();
  for (const p of (players ?? []) as Pick<Player, "id" | "name">[])
    candidateMap.set(p.id, p.name);
  for (const s of shareList)
    if (s.player_id && s.players) candidateMap.set(s.player_id, s.players.name);
  const candidates = [...candidateMap.entries()].map(([id, name]) => ({
    id,
    name,
  }));

  return (
    <div>
      <PageHeader
        title={e.description}
        description={`${e.expense_code} · ${formatDate(e.purchase_date)}`}
        action={
          <Link href="/admin/expenses" className={buttonClass("ghost")}>
            ← All expenses
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total cost
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatMoney(e.total_cost)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Paid by
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {e.players?.name ?? e.player_groups?.name ?? "—"}
          </p>
          <p className="mt-1 text-xs text-emerald-600">
            Credited {formatMoney(e.total_cost)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Assigned
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatMoney(totalAssigned)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Unassigned
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${
              unassigned !== 0 ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {formatMoney(unassigned)}
          </p>
        </Card>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Badge tone="info">{methodLabels[e.split_method] ?? e.split_method}</Badge>
        {e.status === "reversed" ? <Badge tone="neutral">Reversed</Badge> : null}
      </div>

      {e.status !== "reversed" && settlement.length > 0 ? (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">
              Who has paid
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                Collected{" "}
                <span className="font-semibold text-emerald-700">
                  {formatMoney(totalPaid)}
                </span>{" "}
                · Outstanding{" "}
                <span
                  className={`font-semibold ${
                    outstanding > 0 ? "text-rose-700" : "text-slate-500"
                  }`}
                >
                  {formatMoney(outstanding)}
                </span>
              </span>
              <Link
                href={`/admin/payments?expense=${e.id}`}
                className={buttonClass("secondary")}
              >
                + Record payment
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 font-medium">Player</th>
                  <th className="py-2 text-right font-medium">Share</th>
                  <th className="py-2 text-right font-medium">Paid</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlement.map((row) => {
                  const settled = isSettled(row.remaining);
                  const partly = !settled && row.paid > SETTLE_TOLERANCE;
                  return (
                    <tr key={row.share.id}>
                      <td className="py-2 font-medium text-slate-700">
                        {row.name}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {formatMoney(row.owed)}
                      </td>
                      <td className="py-2 text-right text-emerald-600">
                        {row.paid > SETTLE_TOLERANCE
                          ? formatMoney(row.paid)
                          : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {settled ? (
                          <Badge tone="going">Settled</Badge>
                        ) : partly ? (
                          <Badge tone="info">
                            {formatMoney(row.remaining)} left
                          </Badge>
                        ) : (
                          <Badge tone="collect">
                            {formatMoney(row.remaining)} due
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-400">
              A player whose wallet already holds credit is settled
              automatically — the credit offsets their share with no manual
              payment. Use bulk payment to apply a lump sum across a player&apos;s
              oldest charges including this expense.
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Split shares
        </h2>
        <ActionForm
          action={regenerateExpenseShares}
          className="p-4"
          pendingLabel="Regenerating split…"
          hidden={<input type="hidden" name="expense_id" value={e.id} />}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 font-medium">Include</th>
                  <th className="py-2 font-medium">Player</th>
                  <th className="py-2 font-medium">Units</th>
                  <th className="py-2 font-medium">Override ₱</th>
                  <th className="py-2 text-right font-medium">Current</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((c) => {
                  const existing = shareByPlayer.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td className="py-2">
                        <input
                          type="hidden"
                          name="share_player_ids"
                          value={c.id}
                        />
                        <input
                          type="checkbox"
                          name={`include-${c.id}`}
                          defaultChecked={existing != null}
                        />
                      </td>
                      <td className="py-2 font-medium text-slate-700">
                        {c.name}
                      </td>
                      <td className="py-2">
                        <input
                          name={`units-${c.id}`}
                          type="number"
                          step="0.5"
                          min="0"
                          defaultValue={existing?.share_units ?? 1}
                          className="w-16 rounded-md border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          name={`override-${c.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={existing?.override_share_amount ?? ""}
                          placeholder="—"
                          className="w-24 rounded-md border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {existing ? formatMoney(existing.amount_owed) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Regenerating voids and replaces existing shares and the buyer
            reimbursement credit.
          </p>
          <div className="mt-3">
            <SubmitButton pendingLabel="Regenerating…">
              Regenerate split
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card className="mt-5 border-rose-200 p-4">
        <h2 className="mb-2 text-sm font-semibold text-rose-700">Danger zone</h2>
        <div className="flex flex-wrap gap-2">
          <ConfirmButton
            action={reverseExpense}
            message="Reverse this expense? All shares and the buyer credit will be voided."
            hidden={{ id: e.id }}
            pendingLabel="Reversing…"
          >
            Reverse expense
          </ConfirmButton>
          <ConfirmButton
            action={deleteExpense}
            message="Delete this expense? If it has shares it will be reversed instead."
            variant="ghost"
            hidden={{ id: e.id }}
            pendingLabel="Deleting…"
          >
            Delete
          </ConfirmButton>
        </div>
      </Card>
    </div>
  );
}
