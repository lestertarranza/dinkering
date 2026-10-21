import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { resolveWalletOwnersForPlayers } from "@/lib/ledger";
import {
  attachChargeLabels,
  fetchActiveLedgerByWallet,
  openChargesFromLedger,
  walletKey,
} from "@/lib/payment-allocation";
import { SETTLE_TOLERANCE, phTodayYmd } from "@/lib/format";
import type { PlayerGroup } from "@/lib/types";
import { groupTransferLabel } from "@/lib/balance-transfer";
import { TransferForm } from "../../../players/[id]/transfer/TransferForm";
import { BulkCollectForm, type BulkSource } from "../../../players/[id]/transfer/BulkCollectForm";

export const dynamic = "force-dynamic";

export default async function GroupTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const today = phTodayYmd();

  const [{ data: group }, { data: players }, { data: groups }, ledgerByWallet] =
    await Promise.all([
      supabase
        .from("player_groups")
        .select("id, name, type")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("players")
        .select("id, name")
        .neq("active_status", "archived")
        .order("name"),
      supabase.from("player_groups").select("id, name, type").order("name"),
      fetchActiveLedgerByWallet(supabase),
    ]);

  if (!group) notFound();
  const g = group as Pick<PlayerGroup, "id" | "name" | "type">;
  const groupName = groupTransferLabel(g.name, g.type);
  const sourceKey = `g:${g.id}`;
  const playerRows = (players ?? []) as { id: string; name: string }[];
  const groupRows = (groups ?? []) as Pick<PlayerGroup, "id" | "name" | "type">[];

  const owners = await resolveWalletOwnersForPlayers(
    supabase,
    playerRows.map((p) => p.id),
    today,
  );

  const openCharges = await attachChargeLabels(
    supabase,
    openChargesFromLedger(ledgerByWallet.get(sourceKey) ?? []),
  );

  const targets = [
    ...playerRows
      .filter((p) => walletKey(owners.get(p.id) ?? { player_id: p.id, player_group_id: null }) !== sourceKey)
      .map((p) => ({
        value: `p:${p.id}`,
        name: p.name,
        kind: "player" as const,
      })),
    ...groupRows
      .filter((row) => row.id !== g.id)
      .map((row) => ({
        value: `g:${row.id}`,
        name: groupTransferLabel(row.name, row.type),
        kind: "group" as const,
      })),
  ];

  const unique = new Map<string, string>();
  for (const p of playerRows) {
    const key = walletKey(
      owners.get(p.id) ?? { player_id: p.id, player_group_id: null },
    );
    if (!key || key === sourceKey || unique.has(key)) continue;
    const owner = owners.get(p.id);
    unique.set(
      key,
      owner?.player_group_id
        ? groupRows.find((row) => row.id === owner.player_group_id)?.name || p.name
        : p.name,
    );
  }
  for (const row of groupRows) {
    const key = `g:${row.id}`;
    if (key === sourceKey || unique.has(key)) continue;
    unique.set(key, groupTransferLabel(row.name, row.type));
  }

  const bulkSources: BulkSource[] = [];
  for (const [key, name] of unique) {
    const charges = openChargesFromLedger(ledgerByWallet.get(key) ?? []);
    const remaining = charges.reduce((s, c) => s + Number(c.remaining), 0);
    if (remaining < SETTLE_TOLERANCE) continue;
    bulkSources.push({
      id: key,
      name,
      remaining,
      chargeCount: charges.length,
    });
  }
  bulkSources.sort((a, b) => b.remaining - a.remaining);

  return (
    <div>
      <PageHeader
        title={`Transfer balance — ${g.name}`}
        description="Send this group fund's charges to a player or another group fund, or pull other debts onto it."
        action={
          <Link href={`/admin/groups/${g.id}`} className={buttonClass("ghost")}>
            ← Back to group
          </Link>
        }
      />

      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Send {g.name}&apos;s charges away
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Pick which open items move, then choose a player or another group
            fund.
          </p>
          <TransferForm
            sourceWallet={sourceKey}
            sourceName={groupName}
            openCharges={openCharges}
            targets={targets}
          />
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Collect onto {g.name}
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Tick every player or group fund whose outstanding balance should
            move here. A shared wallet appears once.
          </p>
          <BulkCollectForm
            targetWallet={sourceKey}
            targetName={g.name}
            sources={bulkSources}
          />
        </Card>
      </div>

      <div className="mx-auto mt-6 max-w-5xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">How this works</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700">
          <li>
            A <strong>credit</strong> is posted to each source wallet, clearing
            their debt.
          </li>
          <li>
            An equivalent <strong>charge</strong> is posted to the receiving
            wallet.
          </li>
          <li>
            Choosing this group fund posts straight to its shared wallet. A
            player still uses their own couple, family, or team fund when they
            have one.
          </li>
          <li>
            Members of this fund are not listed as a separate target, because
            their charges already sit here.
          </li>
        </ul>
      </div>
    </div>
  );
}
