import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { resolveWalletOwner } from "@/lib/ledger";
import { getOpenCharges } from "@/lib/payment-allocation";
import type { Player } from "@/lib/types";
import { TransferForm } from "./TransferForm";

export const dynamic = "force-dynamic";

export default async function TransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: player }, { data: allPlayers }] = await Promise.all([
    supabase.from("players").select("id, name, display_name").eq("id", id).single(),
    supabase
      .from("players")
      .select("id, name")
      .neq("active_status", "archived")
      .neq("id", id)
      .order("name"),
  ]);

  if (!player) notFound();
  const p = player as Pick<Player, "id" | "name" | "display_name">;
  const playerName = p.display_name?.trim() || p.name;

  // Resolve the source player's active wallet and load their open charges.
  const wallet = await resolveWalletOwner(supabase, id, today);
  const openCharges = await getOpenCharges(supabase, wallet);

  return (
    <div>
      <PageHeader
        title={`Transfer balance — ${playerName}`}
        description="Move outstanding charges from this player to another player. An audit trail is preserved on both ledgers."
        action={
          <Link href={`/admin/players/${id}`} className={buttonClass("ghost")}>
            ← Back to player
          </Link>
        }
      />

      <div className="mx-auto max-w-xl">
        <Card className="p-6">
          <TransferForm
            sourcePlayerId={id}
            sourcePlayerName={playerName}
            openCharges={openCharges}
            players={(allPlayers ?? []) as { id: string; name: string }[]}
          />
        </Card>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">How this works</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700">
            <li>A <strong>credit</strong> is posted to {playerName}&apos;s wallet — removing their debt.</li>
            <li>An equivalent <strong>charge</strong> is posted to the target player&apos;s wallet — adding the debt there.</li>
            <li>Both ledger entries describe which charges were transferred so the history is clear.</li>
            <li>The transfer respects group wallet routing — if either player is in a pooled group, their group wallet is used.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
