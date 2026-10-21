import type { WalletOwner } from "@/lib/ledger";

/** A player or a group fund on one side of a balance transfer. */
export type TransferParty = { kind: "player" | "group"; id: string };

const GROUP_TYPE_LABEL: Record<string, string> = {
  individual: "Individual",
  couple: "Couple",
  family: "Family",
  team_fund: "Team fund",
};

/**
 * Form values use p: or g: so a group fund is not mistaken for a player.
 * A bare id stays a player so older forms still submit.
 */
export function parseTransferParty(raw: string): TransferParty | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("g:")) {
    const id = value.slice(2).trim();
    return id ? { kind: "group", id } : null;
  }
  if (value.startsWith("p:")) {
    const id = value.slice(2).trim();
    return id ? { kind: "player", id } : null;
  }
  return { kind: "player", id: value };
}

export function transferPartyValue(party: TransferParty): string {
  return party.kind === "group" ? `g:${party.id}` : `p:${party.id}`;
}

export function groupTransferLabel(name: string, type: string): string {
  const kind = GROUP_TYPE_LABEL[type] ?? "Group";
  return `${name} (${kind})`;
}

/** True when both sides would post to the same ledger wallet. */
export function sameTransferWallet(a: WalletOwner, b: WalletOwner): boolean {
  if (a.player_group_id && a.player_group_id === b.player_group_id) return true;
  return Boolean(
    a.player_id &&
      !a.player_group_id &&
      b.player_id &&
      !b.player_group_id &&
      a.player_id === b.player_id,
  );
}
