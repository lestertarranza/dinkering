import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { resolveWalletOwner, resolveWalletOwnersForPlayers } from "@/lib/ledger";
import { getOpenCharges } from "@/lib/payment-allocation";
import { SETTLE_TOLERANCE } from "@/lib/format";
import type { Player, PlayerGroup } from "@/lib/types";
import { TransferForm } from "./TransferForm";
import { BulkCollectForm, type BulkSource } from "./BulkCollectForm";

export const dynamic = "force-dynamic";

function walletKey(w: { player_id: string | null; player_group_id: string | null }) {
  if (w.player_group_id) return `g:${w.player_group_id}`;
  if (w.player_id) return `p:${w.player_id}`;
  return "";
}

export default async function TransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: player }, { data: allPlayers }, { data: groups }] =
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
      supabase.from("player_groups").select("id, name"),
    ]);

  if (!player) notFound();
  const p = player as Pick<Player, "id" | "name" | "display_name">;
  const playerName = p.display_name?.trim() || p.name;
  const others = (allPlayers ?? []) as { id: string; name: string }[];
  const groupName = new Map(
    ((groups ?? []) as Pick<PlayerGroup, "id" | "name">[]).map((g) => [
      g.id,
      g.name,
    ]),
  );

  const wallet = await resolveWalletOwner(supabase, id, today);
  const openCharges = await getOpenCharges(supabase, wallet);
  const targetKey = walletKey(wallet);

  const owners = await resolveWalletOwnersForPlayers(
    supabase,
    others.map((o) => o.id),
    today,
  );

  const unique = new Map<
    string,
    { sourcePlayerId: string; label: string; wallet: typeof wallet }
  >();
  for (const o of others) {
    const w = owners.get(o.id);
    if (!w) continue;
    const key = walletKey(w);
    if (!key || key === targetKey || unique.has(key)) continue;
    unique.set(key, {
      sourcePlayerId: o.id,
      label: w.player_group_id
        ? groupName.get(w.player_group_id) || o.name
        : o.name,
      wallet: w,
    });
  }

  const bulkSources: BulkSource[] = [];
  for (const row of unique.values()) {
    const charges = await getOpenCharges(supabase, row.wallet);
    const remaining = charges.reduce((s, c) => s + Number(c.remaining), 0);
    if (remaining < SETTLE_TOLERANCE) continue;
    bulkSources.push({
      id: row.sourcePlayerId,
      name: row.label,
      remaining,
      chargeCount: charges.length,
    });
  }
  bulkSources.sort((a, b) => b.remaining - a.remaining);

  return (
    <div>
      <PageHeader
        title={`Transfer balance — ${playerName}`}
        description="Send this player's charges to someone else, or pull several other players' debts onto this player."
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
            Pick which of their open items move, then choose one target.
          </p>
          <TransferForm
            sourcePlayerId={id}
            sourcePlayerName={playerName}
            openCharges={openCharges}
            players={others}
          />
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Collect onto {playerName}
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Tick every player whose outstanding balance should move here.
            Couples and family wallets appear once.
          </p>
          <BulkCollectForm
            targetPlayerId={id}
            targetPlayerName={playerName}
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
            Both ledger entries list the original items so history stays clear.
          </li>
          <li>
            Group wallets are respected. Two people who already share a wallet
            cannot transfer to each other.
          </li>
        </ul>
      </div>
    </div>
  );
}
