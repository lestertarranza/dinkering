import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { resolveWalletOwner, resolveWalletOwnersForPlayers } from "@/lib/ledger";
import {
  attachChargeLabels,
  fetchActiveLedgerByWallet,
  openChargesFromLedger,
  walletKey,
} from "@/lib/payment-allocation";
import { SETTLE_TOLERANCE, phTodayYmd } from "@/lib/format";
import type { Player, PlayerGroup } from "@/lib/types";
import { availableCredit } from "@/lib/seat-hold";
import { groupTransferLabel } from "@/lib/balance-transfer";
import { TransferForm } from "./TransferForm";
import { CreditTransferForm } from "./CreditTransferForm";
import { BulkCollectForm, type BulkSource } from "./BulkCollectForm";

export const dynamic = "force-dynamic";

export default async function TransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const today = phTodayYmd();

  const [{ data: player }, { data: allPlayers }, { data: groups }, ledgerByWallet] =
    await Promise.all([
      supabase
        .from("players")
        .select("id, name, display_name")
        .eq("id", id)
        .single(),
      supabase
        .from("players")
        .select("id, name")
        .neq("active_status", "archived")
        .neq("id", id)
        .order("name"),
      supabase.from("player_groups").select("id, name, type").order("name"),
      fetchActiveLedgerByWallet(supabase),
    ]);

  if (!player) notFound();
  const p = player as Pick<Player, "id" | "name" | "display_name">;
  const playerName = p.display_name?.trim() || p.name;
  const others = (allPlayers ?? []) as { id: string; name: string }[];
  const groupList = (groups ?? []) as Pick<PlayerGroup, "id" | "name" | "type">[];
  const groupName = new Map(groupList.map((g) => [g.id, g.name]));

  const [wallet, owners] = await Promise.all([
    resolveWalletOwner(supabase, id, today),
    resolveWalletOwnersForPlayers(
      supabase,
      others.map((o) => o.id),
      today,
    ),
  ]);
  const targetKey = walletKey(wallet);

  const openCharges = await attachChargeLabels(
    supabase,
    openChargesFromLedger(ledgerByWallet.get(targetKey) ?? []),
  );

  const unique = new Map<string, { sourceWallet: string; label: string }>();
  for (const o of others) {
    const w = owners.get(o.id);
    if (!w) continue;
    const key = walletKey(w);
    if (!key || key === targetKey || unique.has(key)) continue;
    unique.set(key, {
      sourceWallet: key,
      label: w.player_group_id
        ? groupName.get(w.player_group_id) || o.name
        : o.name,
    });
  }
  for (const g of groupList) {
    const key = `g:${g.id}`;
    if (key === targetKey || unique.has(key)) continue;
    unique.set(key, {
      sourceWallet: key,
      label: groupTransferLabel(g.name, g.type),
    });
  }

  const targets = [
    ...others.map((o) => ({
      value: `p:${o.id}`,
      name: o.name,
      kind: "player" as const,
    })),
    ...groupList
      .filter((g) => `g:${g.id}` !== targetKey)
      .map((g) => ({
        value: `g:${g.id}`,
        name: groupTransferLabel(g.name, g.type),
        kind: "group" as const,
      })),
  ];

  const bulkSources: BulkSource[] = [];
  for (const [key, row] of unique) {
    const charges = openChargesFromLedger(ledgerByWallet.get(key) ?? []);
    const remaining = charges.reduce((s, c) => s + Number(c.remaining), 0);
    if (remaining < SETTLE_TOLERANCE) continue;
    bulkSources.push({
      id: row.sourceWallet,
      name: row.label,
      remaining,
      chargeCount: charges.length,
    });
  }
  bulkSources.sort((a, b) => b.remaining - a.remaining);

  const { data: personalBalance } = await supabase
    .from("player_balances")
    .select("balance")
    .eq("player_id", id)
    .maybeSingle();
  const personalCredit = availableCredit(Number(personalBalance?.balance ?? 0));

  return (
    <div>
      <PageHeader
        title={`Transfer balance — ${playerName}`}
        description="Send this wallet's charges to a player or a group fund, pull other debts onto it, or move personal credit to another player."
        action={
          <Link href={`/admin/players/${id}`} className={buttonClass("ghost")}>
            ← Back to player
          </Link>
        }
      />

      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Send {playerName}&apos;s charges away
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Pick which open items move, then choose a player or a group fund.
          </p>
          <TransferForm
            sourceWallet={`p:${id}`}
            sourceName={playerName}
            openCharges={openCharges}
            targets={targets}
          />
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Collect onto {playerName}
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Tick every player or group fund whose outstanding balance should
            move here. A shared wallet appears once.
          </p>
          <BulkCollectForm
            targetWallet={`p:${id}`}
            targetName={playerName}
            sources={bulkSources}
          />
        </Card>
      </div>

      <Card className="mx-auto mt-6 max-w-5xl p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">
          Send {playerName}&apos;s personal credit
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Moves credit that sits on this player&apos;s own wallet. A couple,
          family, or team fund is left alone.
        </p>
        <CreditTransferForm
          sourcePlayerId={id}
          sourcePlayerName={playerName}
          available={personalCredit}
          players={others}
        />
      </Card>

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
            Both ledger entries list the original items so history stays clear.
          </li>
          <li>
            A player or a group fund can be either side. Choosing a group fund
            posts straight to that shared wallet.
          </li>
          <li>
            Group wallets are respected when the source or target is a player.
            Two people who already share a wallet cannot transfer charges to
            each other.
          </li>
          <li>
            Personal credit moves only between the two players&apos; own
            wallets. It does not come out of a shared group wallet.
          </li>
        </ul>
      </div>
    </div>
  );
}
