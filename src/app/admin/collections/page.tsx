import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  Badge,
  EmptyState,
  Field,
  inputClass,
  buttonClass,
} from "@/components/ui";
import { CopyReminder } from "@/components/ShareActions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import {
  formatMoney,
  describeBalance,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import { updateGcashNumber, updateBankTransfer } from "./actions";
import type { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

type CollectRow = {
  id: string;
  label: string;
  balance: number;
  kind: "player" | "group";
  token: string;
  pooled?: string;
};

function buildReminder(
  row: CollectRow,
  gcash: string | null,
  bank: string | null,
  appUrl: string,
): string {
  const d = describeBalance(row.balance);
  const link =
    row.kind === "player"
      ? `${appUrl}/p/${row.token}`
      : `${appUrl}/g/${row.token}`;
  const parts: string[] = [];
  if (gcash) parts.push(`GCash: ${gcash}`);
  if (bank) parts.push(`Bank Transfer: ${bank}`);
  const paymentLine =
    parts.length > 0 ? parts.join(" | ") + ". " : "";
  return `Hi ${row.label}, your Dinkering balance is ${formatMoney(d.amount)} owed. ${paymentLine}Please send payment and share your reference. View details: ${link}`;
}

export default async function CollectionsPage() {
  const supabase = await createClient();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  const [
    { data: settings },
    { data: players },
    { data: playerBalances },
    { data: groupBalances },
    { data: groups },
    { data: memberships },
  ] = await Promise.all([
    supabase.from("app_settings").select("gcash_number, bank_transfer_details").single(),
    supabase
      .from("players")
      .select("id, name, display_name, public_token, active_status")
      .eq("active_status", "active")
      .order("name"),
    supabase.from("player_balances").select("player_id, balance"),
    supabase.from("group_balances").select("player_group_id, balance"),
    supabase.from("player_groups").select("id, name, public_token"),
    supabase
      .from("player_group_members")
      .select("player_id, player_group_id, player_groups!inner(name, type)")
      .in("player_groups.type", ["couple", "family", "team_fund"])
      .is("end_date", null),
  ]);

  const gcash = (settings?.gcash_number as string | null) ?? null;
  const bank = (settings?.bank_transfer_details as string | null) ?? null;
  const playerBalMap = new Map(
    ((playerBalances ?? []) as { player_id: string; balance: number }[]).map(
      (b) => [b.player_id, Number(b.balance)],
    ),
  );
  const groupBalMap = new Map(
    ((groupBalances ?? []) as { player_group_id: string; balance: number }[]).map(
      (b) => [b.player_group_id, Number(b.balance)],
    ),
  );
  const groupTokenMap = new Map(
    ((groups ?? []) as { id: string; public_token: string }[]).map((g) => [
      g.id,
      g.public_token,
    ]),
  );
  const pooledMap = new Map<
    string,
    { groupId: string; name: string }
  >();
  for (const m of (memberships ?? []) as unknown as {
    player_id: string;
    player_group_id: string;
    player_groups: { name: string } | null;
  }[]) {
    if (!pooledMap.has(m.player_id)) {
      pooledMap.set(m.player_id, {
        groupId: m.player_group_id,
        name: m.player_groups?.name ?? "group",
      });
    }
  }

  const rows: CollectRow[] = ((players ?? []) as Pick<
    Player,
    "id" | "name" | "display_name" | "public_token"
  >[])
    .map((p) => {
      const pooled = pooledMap.get(p.id);
      const balance = pooled
        ? groupBalMap.get(pooled.groupId) ?? 0
        : playerBalMap.get(p.id) ?? 0;
      return {
        id: p.id,
        label: p.display_name?.trim() || p.name,
        balance,
        kind: pooled ? ("group" as const) : ("player" as const),
        token: pooled
          ? groupTokenMap.get(pooled.groupId) ?? p.public_token
          : p.public_token,
        pooled: pooled?.name,
      };
    })
    .filter((r) => r.balance >= SETTLE_TOLERANCE)
    .sort((a, b) => b.balance - a.balance);

  const totalOwed = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Who owes the team — copy payment reminders to send via chat."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Card className="border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800">Total collectible</p>
          <p className="mt-1 text-3xl font-bold text-rose-700">
            {formatMoney(totalOwed)}
          </p>
          <p className="mt-1 text-sm text-rose-600">
            {rows.length} player{rows.length === 1 ? "" : "s"} owe
          </p>
        </Card>

        <Card className="space-y-4 p-4">
          <ActionForm
            action={updateGcashNumber}
            className="space-y-2"
            pendingLabel="Saving GCash number…"
          >
            <Field
              label="GCash number"
              hint="Shown in payment reminder messages"
            >
              <input
                name="gcash_number"
                defaultValue={gcash ?? ""}
                placeholder="09XX XXX XXXX"
                className={inputClass}
              />
            </Field>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Save GCash
            </SubmitButton>
          </ActionForm>
          <div className="border-t border-slate-100 pt-4">
            <ActionForm
              action={updateBankTransfer}
              className="space-y-2"
              pendingLabel="Saving bank details…"
            >
              <Field
                label="Bank transfer details"
                hint="e.g. BDO · John Doe · 1234567890 — shown in reminders"
              >
                <input
                  name="bank_transfer_details"
                  defaultValue={bank ?? ""}
                  placeholder="Bank · Account name · Account number"
                  className={inputClass}
                />
              </Field>
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                Save bank details
              </SubmitButton>
            </ActionForm>
          </div>
        </Card>
      </div>

      <p className="mb-3">
        <a
          href="/api/export/balances"
          className={buttonClass("secondary", "inline-flex")}
        >
          Export balances (CSV)
        </a>
      </p>

      {rows.length === 0 ? (
        <EmptyState title="Everyone is settled — nothing to collect" />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => {
            const d = describeBalance(r.balance);
            const adminHref =
              r.kind === "player"
                ? `/admin/players/${r.id}`
                : `/admin/groups`;
            return (
              <div
                key={r.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={adminHref}
                    className="text-base font-semibold text-slate-900 hover:text-emerald-700"
                  >
                    {r.label}
                  </Link>
                  {r.pooled ? (
                    <p className="text-sm text-slate-500">
                      Shared with {r.pooled}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={d.tone}>{d.label}</Badge>
                    <span className="text-lg font-bold text-rose-700">
                      {formatMoney(d.amount)}
                    </span>
                  </div>
                </div>
                <CopyReminder
                  message={buildReminder(r, gcash, bank, appUrl)}
                  label="Copy reminder"
                />
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
