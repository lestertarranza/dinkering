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
import { DownloadCsvButton } from "@/components/DownloadCsvButton";
import {
  formatMoney,
  formatDate,
  describeBalance,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import {
  updateGcashNumber,
  updateBankTransfer,
  markContacted,
  confirmPaymentProof,
  rejectPaymentProof,
} from "./actions";
import type { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

type CollectRow = {
  id: string;
  ownerId: string;
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
  if (bank) parts.push(`Bank Transfer (preferred): ${bank}`);
  parts.push("Prefer GCash? Message me and I'll send the details.");
  if (gcash) parts.push(`GCash: ${gcash}`);
  const paymentLine =
    parts.length > 0 ? parts.join(" | ") + ". " : "";
  return `Hi ${row.label}, your Dinkering balance is ${formatMoney(d.amount)} owed. ${paymentLine}Please send payment and share your reference. View details: ${link}`;
}

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const view = viewParam === "high" || viewParam === "uncontacted" ? viewParam : "all";
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
    { data: recentPayRows },
    { data: proofs },
    { data: contacts },
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
    supabase
      .from("payments")
      .select("payment_code, payment_date, amount, payment_method, reference_number, notes, players(name), player_groups(name)")
      .order("payment_date", { ascending: false })
      .limit(500),
    supabase
      .from("payment_proofs")
      .select(
        "id, player_id, player_group_id, amount, reference_number, image_url, status, created_at, players(name), player_groups(name)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.from("collection_contacts").select("owner_kind, owner_id, contacted_at"),
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
        ownerId: pooled ? pooled.groupId : p.id,
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

  // Deduplicate group balances: multiple members of the same group each show
  // the group wallet balance, so we must count each group's balance only once.
  const seenGroupTokens = new Set<string>();
  const totalOwed = rows.reduce((s, r) => {
    if (r.kind === "group") {
      if (seenGroupTokens.has(r.token)) return s;
      seenGroupTokens.add(r.token);
    }
    return s + r.balance;
  }, 0);

  const contactedAt = new Map<string, string>();
  for (const c of (contacts ?? []) as {
    owner_kind: string;
    owner_id: string;
    contacted_at: string;
  }[]) {
    contactedAt.set(`${c.owner_kind}:${c.owner_id}`, c.contacted_at);
  }

  const filteredRows = rows.filter((r) => {
    if (view === "high") return r.balance >= 500;
    if (view === "uncontacted")
      return !contactedAt.has(`${r.kind}:${r.ownerId}`);
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Who owes the team — copy payment reminders to send via chat."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All owing"],
            ["high", "High (₱500+)"],
            ["uncontacted", "Not contacted"],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            href={id === "all" ? "/admin/collections" : `/admin/collections?view=${id}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              view === id
                ? "bg-emerald-600 text-white"
                : "text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

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
                hint="Optional. Players are asked to message you for GCash."
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

      <p className="mb-3 flex flex-wrap gap-2">
        <a
          href="/api/export/balances"
          className={buttonClass("secondary", "inline-flex")}
        >
          Export balances (CSV)
        </a>
        <DownloadCsvButton
          filename={`collections-${new Date().toISOString().slice(0, 7)}.csv`}
          label="Export payments (CSV)"
          rows={[
            ["Code", "Date", "Payer", "Amount", "Method", "Reference", "Notes"],
            ...((recentPayRows ?? []) as unknown as {
              payment_code: string | null;
              payment_date: string;
              amount: number;
              payment_method: string | null;
              reference_number: string | null;
              notes: string | null;
              players: { name: string } | null;
              player_groups: { name: string } | null;
            }[]).map((p) => [
              p.payment_code ?? "",
              p.payment_date,
              p.players?.name ?? p.player_groups?.name ?? "",
              String(p.amount),
              p.payment_method ?? "",
              p.reference_number ?? "",
              p.notes ?? "",
            ]),
          ]}
        />
      </p>

      {(proofs ?? []).length > 0 ? (
        <Card className="mb-5 overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              Pending payment proofs
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {(proofs ?? []).map((pr) => {
              const row = pr as unknown as {
                id: string;
                amount: number | null;
                reference_number: string | null;
                image_url: string;
                created_at: string;
                players: { name: string } | null;
                player_groups: { name: string } | null;
              };
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <a href={row.image_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.image_url}
                      alt="Payment proof"
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  </a>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {row.players?.name ?? row.player_groups?.name ?? "Player"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {row.amount != null ? formatMoney(Number(row.amount)) : "Amount not set"}
                      {row.reference_number ? ` · ${row.reference_number}` : ""}
                    </p>
                  </div>
                  <ActionForm
                    action={confirmPaymentProof}
                    className="flex items-center gap-2"
                    pendingLabel="Recording…"
                    hidden={<input type="hidden" name="id" value={row.id} />}
                  >
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      defaultValue={row.amount != null ? String(row.amount) : ""}
                      required
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <SubmitButton pendingLabel="…">Confirm</SubmitButton>
                  </ActionForm>
                  <ActionForm
                    action={rejectPaymentProof}
                    pendingLabel="…"
                    hidden={<input type="hidden" name="id" value={row.id} />}
                  >
                    <SubmitButton variant="ghost" pendingLabel="…">
                      Reject
                    </SubmitButton>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {filteredRows.length === 0 ? (
        <EmptyState title="Everyone is settled — nothing to collect" />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {filteredRows.map((r) => {
            const d = describeBalance(r.balance);
            const last = contactedAt.get(`${r.kind}:${r.ownerId}`);
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
                    {last ? (
                      <span className="text-xs text-slate-400">
                        Contacted {formatDate(last.slice(0, 10))}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">Not contacted</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                <CopyReminder
                  message={buildReminder(r, gcash, bank, appUrl)}
                  label="Copy reminder"
                />
                <ActionForm
                  action={markContacted}
                  pendingLabel="Saving…"
                  hidden={
                    <>
                      <input type="hidden" name="owner_kind" value={r.kind} />
                      <input type="hidden" name="owner_id" value={r.ownerId} />
                    </>
                  }
                >
                  <SubmitButton variant="secondary" pendingLabel="…">
                    Mark contacted
                  </SubmitButton>
                </ActionForm>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
