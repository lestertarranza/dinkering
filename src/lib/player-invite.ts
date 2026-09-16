import { publicPlayerLabel, type LinkedIdentity } from "@/lib/player-identity";

export type InviteRecord = {
  isFoundingMember: boolean;
  invitedByPlayerId: string | null;
};

export type InviteIndex = {
  ready: boolean;
  byId: Map<string, InviteRecord>;
  players: Map<
    string,
    { name: string; display_name: string | null; active_status: string }
  >;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function emptyInviteIndex(): InviteIndex {
  return { ready: false, byId: new Map(), players: new Map() };
}

export function parseInviteChoice(raw: string): InviteRecord {
  const v = raw.trim();
  if (v === "founding") {
    return { isFoundingMember: true, invitedByPlayerId: null };
  }
  if (UUID_RE.test(v)) {
    return { isFoundingMember: false, invitedByPlayerId: v };
  }
  return { isFoundingMember: false, invitedByPlayerId: null };
}

export function inviteSelectValue(rec: InviteRecord | undefined): string {
  if (!rec) return "";
  if (rec.isFoundingMember) return "founding";
  return rec.invitedByPlayerId ?? "";
}

export function inviteLine(
  rec: InviteRecord | undefined,
  inviterName: string | null,
): string | null {
  if (!rec) return null;
  if (rec.isFoundingMember) return "Founding member";
  if (!rec.invitedByPlayerId) return null;
  if (inviterName?.trim()) return `Invited by ${inviterName.trim()}`;
  return "Invited by a teammate";
}

export function inviteLineFromIndex(
  playerId: string,
  index: InviteIndex,
  identities: Map<string, LinkedIdentity> = new Map(),
): string | null {
  const rec = index.byId.get(playerId);
  if (!rec) return null;
  if (rec.isFoundingMember) return "Founding member";
  if (!rec.invitedByPlayerId) return null;
  const inviter = index.players.get(rec.invitedByPlayerId);
  if (!inviter) return "Invited by a teammate";
  return `Invited by ${publicPlayerLabel(
    inviter,
    identities.get(rec.invitedByPlayerId),
  )}`;
}

export function inviteOptionsFromIndex(
  index: InviteIndex,
  identities: Map<string, LinkedIdentity> = new Map(),
  exceptId?: string,
): { id: string; label: string }[] {
  return [...index.players.entries()]
    .filter(
      ([id, p]) =>
        id !== exceptId && p.active_status !== "archived",
    )
    .map(([id, p]) => ({
      id,
      label: publicPlayerLabel(p, identities.get(id)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function recordFromRow(row: {
  is_founding_member?: boolean | null;
  invited_by_player_id?: string | null;
}): InviteRecord {
  return {
    isFoundingMember: !!row.is_founding_member,
    invitedByPlayerId: row.invited_by_player_id ?? null,
  };
}
