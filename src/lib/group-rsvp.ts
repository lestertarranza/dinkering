import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/account-fields";

const POOLED_TYPES = new Set(["couple", "family", "team_fund"]);

export type GroupRsvpGrant = {
  groupId: string;
  groupName: string;
};

type Membership = {
  playerId: string;
  groupId: string;
  isPrimary: boolean;
  start: string | null;
  end: string | null;
};

type GroupInfo = {
  id: string;
  name: string;
  pooled: boolean;
  membersCanRsvp: boolean;
};

export type GroupRsvpContext = {
  memberships: Membership[];
  groups: Map<string, GroupInfo>;
};

type GroupJoin = {
  id: string;
  name: string;
  type: string;
  members_can_rsvp?: boolean | null;
};

type MemberRow = {
  player_id: string;
  player_group_id: string;
  is_primary: boolean | null;
  start_date: string | null;
  end_date: string | null;
  player_groups: GroupJoin | GroupJoin[] | null;
};

export function membershipCovers(
  start: string | null,
  end: string | null,
  onDate: string,
): boolean {
  return (!start || start <= onDate) && (!end || end >= onDate);
}

/**
 * Same wallet choice as resolveWalletOwner: an active pooled membership,
 * with a primary membership ahead of the others.
 */
export function walletGroupId(
  memberships: Membership[],
  groups: Map<string, GroupInfo>,
  playerId: string,
  onDate: string,
): string | null {
  const active = memberships.filter(
    (m) =>
      m.playerId === playerId &&
      groups.get(m.groupId)?.pooled &&
      membershipCovers(m.start, m.end, onDate),
  );
  if (active.length === 0) return null;
  active.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  return active[0].groupId;
}

/**
 * A signed-in member may RSVP for another member when the target's charges
 * for that date route to a pooled group, that group allows it, and the
 * viewer is a member of that same group on that date.
 */
export function groupRsvpGrantOn(
  ctx: GroupRsvpContext,
  viewerPlayerId: string | null | undefined,
  targetPlayerId: string,
  onDate: string,
): GroupRsvpGrant | null {
  if (!viewerPlayerId || viewerPlayerId === targetPlayerId) return null;
  const groupId = walletGroupId(
    ctx.memberships,
    ctx.groups,
    targetPlayerId,
    onDate,
  );
  if (!groupId) return null;
  const group = ctx.groups.get(groupId);
  if (!group?.pooled || !group.membersCanRsvp) return null;
  const viewerInGroup = ctx.memberships.some(
    (m) =>
      m.playerId === viewerPlayerId &&
      m.groupId === groupId &&
      membershipCovers(m.start, m.end, onDate),
  );
  if (!viewerInGroup) return null;
  return { groupId, groupName: group.name };
}

function joinGroup(raw: GroupJoin | GroupJoin[] | null): GroupJoin | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export async function loadGroupRsvpContext(
  db: SupabaseClient,
  playerIds: string[],
): Promise<GroupRsvpContext> {
  const empty: GroupRsvpContext = { memberships: [], groups: new Map() };
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0) return empty;

  const withFlag =
    "player_id, player_group_id, is_primary, start_date, end_date, player_groups!inner(id, name, type, members_can_rsvp)";
  const first = await db
    .from("player_group_members")
    .select(withFlag)
    .in("player_id", ids)
    .in("player_groups.type", ["couple", "family", "team_fund"]);

  let data = first.data as unknown as MemberRow[] | null;
  let error = first.error;
  if (error && isMissingRelation(error)) {
    const retry = await db
      .from("player_group_members")
      .select(
        "player_id, player_group_id, is_primary, start_date, end_date, player_groups!inner(id, name, type)",
      )
      .in("player_id", ids)
      .in("player_groups.type", ["couple", "family", "team_fund"]);
    data = retry.data as unknown as MemberRow[] | null;
    error = retry.error;
  }
  if (error || !data) return empty;

  const groups = new Map<string, GroupInfo>();
  const memberships: Membership[] = [];
  for (const row of data) {
    const group = joinGroup(row.player_groups);
    if (!group) continue;
    groups.set(group.id, {
      id: group.id,
      name: group.name,
      pooled: POOLED_TYPES.has(group.type),
      membersCanRsvp: group.members_can_rsvp === true,
    });
    memberships.push({
      playerId: row.player_id,
      groupId: row.player_group_id,
      isPrimary: !!row.is_primary,
      start: row.start_date,
      end: row.end_date,
    });
  }
  return { memberships, groups };
}
