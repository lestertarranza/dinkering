import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { formatMoney, SETTLE_TOLERANCE } from "@/lib/format";

export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireAdmin());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const [
    { data: players },
    { data: groups },
    { data: playerBalances },
    { data: groupBalances },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, name, display_name, active_status")
      .neq("active_status", "archived")
      .order("name"),
    supabase.from("player_groups").select("id, name").order("name"),
    supabase.from("player_balances").select("player_id, balance"),
    supabase.from("group_balances").select("player_group_id, balance"),
  ]);

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

  const lines = ["type,name,balance,status"];

  for (const p of (players ?? []) as {
    id: string;
    name: string;
    display_name: string | null;
  }[]) {
    const balance = playerBalMap.get(p.id) ?? 0;
    const label = p.display_name?.trim() || p.name;
    const status =
      Math.abs(balance) < SETTLE_TOLERANCE
        ? "settled"
        : balance > 0
          ? "owes"
          : "credit";
    lines.push(
      ["player", csvEscape(label), formatMoney(Math.abs(balance)), status].join(
        ",",
      ),
    );
  }

  for (const g of (groups ?? []) as { id: string; name: string }[]) {
    const balance = groupBalMap.get(g.id) ?? 0;
    const status =
      Math.abs(balance) < SETTLE_TOLERANCE
        ? "settled"
        : balance > 0
          ? "owes"
          : "credit";
    lines.push(
      ["group", csvEscape(g.name), formatMoney(Math.abs(balance)), status].join(
        ",",
      ),
    );
  }

  const csv = `\uFEFF${lines.join("\n")}`;
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dinkering-balances-${date}.csv"`,
    },
  });
}
