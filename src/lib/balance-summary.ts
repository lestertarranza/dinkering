import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenCharges, type OpenCharge } from "@/lib/payment-allocation";
import { round2 } from "@/lib/ledger";
import { formatMoney, formatDate, isSettled } from "@/lib/format";

const POOLED_TYPES = ["couple", "family", "team_fund"];

export type PlayerBalanceSummary = {
  /** Plain-text, copy-and-paste ready message for the player. */
  text: string;
  /** Net amount the player still owes (0 if settled or in credit). */
  totalDue: number;
  /** Number of outstanding line items included. */
  itemCount: number;
};

/**
 * Build a plain-text balance summary for a single player that the admin can
 * copy and send (e.g. via chat). Lists every still-open charge with its
 * remaining amount and a grand total, mirroring the FIFO credit logic used
 * everywhere else. Pooled players (couple/family/team_fund) get their shared
 * wallet items in a separate section since that's where active charges land.
 */
export async function buildPlayerBalanceSummary(
  db: SupabaseClient,
  playerId: string,
  opts: { appUrl?: string; asOf?: string } = {},
): Promise<PlayerBalanceSummary | null> {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

  const { data: player } = await db
    .from("players")
    .select("id, name, display_name, public_token")
    .eq("id", playerId)
    .single();
  if (!player) return null;

  // Pooled wallet (couple/family/team_fund) this player currently belongs to.
  const { data: memberships } = await db
    .from("player_group_members")
    .select("player_group_id, player_groups!inner(name, type)")
    .eq("player_id", playerId)
    .in("player_groups.type", POOLED_TYPES)
    .is("end_date", null);
  const pooled = (memberships ?? [])[0] as unknown as
    | { player_group_id: string; player_groups: { name: string } | null }
    | undefined;
  const groupId = pooled?.player_group_id ?? null;
  const groupName = pooled?.player_groups?.name ?? "shared";

  // Open charges per wallet, plus balances (to detect credit when nothing is due).
  const [personalOpen, groupOpen, personalBalRes, groupBalRes] = await Promise.all([
    getOpenCharges(db, { player_id: playerId, player_group_id: null }),
    groupId
      ? getOpenCharges(db, { player_id: null, player_group_id: groupId })
      : Promise.resolve([] as OpenCharge[]),
    db.from("player_balances").select("balance").eq("player_id", playerId).single(),
    groupId
      ? db
          .from("group_balances")
          .select("balance")
          .eq("player_group_id", groupId)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const personalDue = round2(personalOpen.reduce((s, c) => s + c.remaining, 0));
  const groupDue = round2(groupOpen.reduce((s, c) => s + c.remaining, 0));
  const totalDue = round2(personalDue + groupDue);

  const personalBalance = Number(personalBalRes.data?.balance ?? 0);
  const groupBalance = Number(groupBalRes.data?.balance ?? 0);
  const combinedBalance = round2(personalBalance + groupBalance);

  const name = player.display_name?.trim() || player.name;
  const item = (c: OpenCharge) => `• ${c.label}: ${formatMoney(c.remaining)}`;

  const lines: string[] = [];
  lines.push(`Hi ${name}! Here's your Dinkering balance summary as of ${formatDate(asOf)}.`);
  lines.push("");

  if (isSettled(totalDue)) {
    if (combinedBalance <= -0.5) {
      lines.push(
        `You're all paid up and have a credit of ${formatMoney(Math.abs(combinedBalance))}.`,
      );
      lines.push("It will be applied automatically to your future charges.");
    } else {
      lines.push("You're all settled — nothing due. Thank you! 🎉");
    }
  } else {
    if (groupId && groupOpen.length > 0) {
      lines.push(`Shared (${groupName}) charges:`);
      for (const c of groupOpen) lines.push(item(c));
      lines.push(`Shared subtotal: ${formatMoney(groupDue)}`);
      lines.push("");
    }
    if (personalOpen.length > 0) {
      lines.push(groupId ? "Personal charges:" : "Outstanding charges:");
      for (const c of personalOpen) lines.push(item(c));
      if (groupId) {
        lines.push(`Personal subtotal: ${formatMoney(personalDue)}`);
        lines.push("");
      }
    }
    lines.push(`TOTAL DUE: ${formatMoney(totalDue)}`);
  }

  if (opts.appUrl && player.public_token) {
    lines.push("");
    lines.push(`View details anytime: ${opts.appUrl}/p/${player.public_token}`);
  }

  return {
    text: lines.join("\n"),
    totalDue,
    itemCount: personalOpen.length + groupOpen.length,
  };
}

export type GroupBalanceSummary = {
  /** Plain-text, copy-and-paste ready message for the group. */
  text: string;
  /** Amount the group's shared wallet still owes (0 if settled or in credit). */
  totalDue: number;
  /** Number of outstanding shared line items included. */
  itemCount: number;
};

/**
 * Build a plain-text balance summary for a whole group that the admin can copy
 * and send. Group members share one pooled wallet, so this lists the shared
 * open charges and a grand total, names the members it covers, and flags any
 * member balances that are still sitting un-pooled on their personal wallets.
 */
export async function buildGroupBalanceSummary(
  db: SupabaseClient,
  groupId: string,
  opts: { appUrl?: string; asOf?: string } = {},
): Promise<GroupBalanceSummary | null> {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

  const { data: group } = await db
    .from("player_groups")
    .select("id, name, public_token")
    .eq("id", groupId)
    .single();
  if (!group) return null;

  const { data: memberRows } = await db
    .from("player_group_members")
    .select("player_id, players(id, name)")
    .eq("player_group_id", groupId)
    .is("end_date", null);
  const members = ((memberRows ?? []) as unknown as {
    player_id: string;
    players: { id: string; name: string } | null;
  }[])
    .map((m) => ({ id: m.player_id, name: m.players?.name ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const memberIds = members.map((m) => m.id);

  const [groupOpen, groupBalRes, memberBalRes] = await Promise.all([
    getOpenCharges(db, { player_id: null, player_group_id: groupId }),
    db.from("group_balances").select("balance").eq("player_group_id", groupId).single(),
    memberIds.length
      ? db.from("player_balances").select("player_id, balance").in("player_id", memberIds)
      : Promise.resolve({ data: [] as { player_id: string; balance: number }[] }),
  ]);

  const totalDue = round2(groupOpen.reduce((s, c) => s + c.remaining, 0));
  const groupBalance = Number(groupBalRes.data?.balance ?? 0);
  const memberBalanceMap = new Map(
    ((memberBalRes.data ?? []) as { player_id: string; balance: number }[]).map((b) => [
      b.player_id,
      Number(b.balance),
    ]),
  );
  const unpooled = members
    .map((m) => ({ name: m.name, balance: memberBalanceMap.get(m.id) ?? 0 }))
    .filter((m) => !isSettled(Math.abs(m.balance)));

  const item = (c: OpenCharge) => `• ${c.label}: ${formatMoney(c.remaining)}`;

  const lines: string[] = [];
  lines.push(`Hi ${group.name}! Here's your Dinkering balance summary as of ${formatDate(asOf)}.`);
  if (members.length > 0) lines.push(`Members: ${members.map((m) => m.name).join(", ")}`);
  lines.push("");

  if (isSettled(totalDue)) {
    if (groupBalance <= -0.5) {
      lines.push(`You're all paid up and have a credit of ${formatMoney(Math.abs(groupBalance))}.`);
      lines.push("It will be applied automatically to your future charges.");
    } else {
      lines.push("You're all settled — nothing due. Thank you! 🎉");
    }
  } else {
    lines.push("Shared charges:");
    for (const c of groupOpen) lines.push(item(c));
    lines.push(`TOTAL DUE: ${formatMoney(totalDue)}`);
  }

  if (unpooled.length > 0) {
    lines.push("");
    lines.push("Not yet pooled (still on individual wallets):");
    for (const m of unpooled) {
      lines.push(
        m.balance > 0
          ? `• ${m.name}: owes ${formatMoney(m.balance)}`
          : `• ${m.name}: credit ${formatMoney(Math.abs(m.balance))}`,
      );
    }
  }

  if (opts.appUrl && group.public_token) {
    lines.push("");
    lines.push(`View details anytime: ${opts.appUrl}/g/${group.public_token}`);
  }

  return {
    text: lines.join("\n"),
    totalDue,
    itemCount: groupOpen.length,
  };
}
