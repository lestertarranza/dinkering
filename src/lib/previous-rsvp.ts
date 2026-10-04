export type PreviousSeatInput = {
  playerId: string;
  name: string;
  previousStatus: string | null | undefined;
  previousWaitlistedAt: string | null | undefined;
  createdAt?: string | null;
};

export type PreviousGoingPerson = { playerId: string; name: string };

export type PreviousWaitPerson = {
  playerId: string;
  name: string;
  position: number;
};

export function groupPreviousSeats(rows: PreviousSeatInput[]): {
  going: PreviousGoingPerson[];
  waitlist: PreviousWaitPerson[];
} {
  const going = rows
    .filter((r) => r.previousStatus === "going")
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((r) => ({ playerId: r.playerId, name: r.name }));

  const waitlist = rows
    .filter((r) => r.previousStatus === "waitlist")
    .sort((a, b) => {
      const at = a.previousWaitlistedAt ?? a.createdAt ?? "";
      const bt = b.previousWaitlistedAt ?? b.createdAt ?? "";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.name.localeCompare(b.name, "en");
    })
    .map((r, i) => ({
      playerId: r.playerId,
      name: r.name,
      position: i + 1,
    }));

  return { going, waitlist };
}

export function previousWaitPosition(
  waitlist: PreviousWaitPerson[],
  playerId: string,
): number | null {
  return waitlist.find((p) => p.playerId === playerId)?.position ?? null;
}
