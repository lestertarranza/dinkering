import { playerFullName } from "@/lib/account-fields";

export type LinkedIdentity = {
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
};

export function claimedFullName(
  rosterName: string,
  linked: LinkedIdentity,
): string {
  const fromClaim = playerFullName(linked.firstName, linked.lastName);
  if (linked.lastName.trim()) return fromClaim;
  const roster = rosterName.trim();
  if (roster.split(/\s+/).length > 1) return roster;
  return fromClaim || roster;
}

/** Public label: claimed players show full name, others keep nickname. */
export function publicPlayerLabel(
  p: { name: string; display_name: string | null },
  linked?: LinkedIdentity | null,
): string {
  if (linked) return claimedFullName(p.name, linked);
  return p.display_name?.trim() || p.name;
}

export function goingChipLabel(
  p: {
    name: string;
    display_name: string | null;
    hidden_on_board?: boolean | null;
  },
  linked?: LinkedIdentity | null,
): string | null {
  if (p.hidden_on_board) return null;
  return publicPlayerLabel(p, linked);
}

export type PlayerFace = {
  name: string;
  verified: boolean;
  avatarUrl: string | null;
};

export function playerFace(
  playerId: string,
  p: { name: string; display_name: string | null },
  identities: Map<string, LinkedIdentity>,
): PlayerFace {
  const linked = identities.get(playerId) ?? null;
  return {
    name: publicPlayerLabel(p, linked),
    verified: !!linked,
    avatarUrl: linked?.avatarUrl ?? null,
  };
}
