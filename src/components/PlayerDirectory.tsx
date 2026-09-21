"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import { PlayerNameLine, publicChevronClass, publicTapRowClass } from "@/components/public-ui";
import { PendingLink } from "@/components/PendingLink";
import { SaveAsMyPage } from "@/components/PublicBottomNav";

export type PlayerDirectoryRow = {
  id: string;
  name: string;
  subtitle: string;
  href: string;
  playerToken: string;
  verified: boolean;
  owned: boolean;
  avatarUrl: string | null;
};

export function PlayerDirectory({
  teamToken,
  rows,
}: {
  teamToken: string;
  rows: PlayerDirectoryRow[];
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? rows.filter((r) =>
            `${r.name} ${r.subtitle}`.toLowerCase().includes(needle),
          )
        : rows,
    [rows, needle],
  );

  return (
    <>
      {rows.length >= 8 ? (
        <div className="mb-3">
          <input
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your name…"
            aria-label="Search your name"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <EmptyState title="No player matches your search" />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {filtered.map((r) => (
            <div key={r.id} className={publicTapRowClass}>
              <PendingLink
                href={r.href}
                busyLabel="Opening player page…"
                className="min-w-0 flex-1"
              >
                <PlayerNameLine
                  name={r.name}
                  verified={r.verified}
                  avatarUrl={r.avatarUrl}
                  subtitle={r.subtitle}
                />
              </PendingLink>
              <SaveAsMyPage
                playerToken={r.playerToken}
                teamToken={teamToken}
                goHome
                compact
                verified={r.verified}
                owned={r.owned}
              />
              <PendingLink
                href={r.href}
                busyLabel="Opening player page…"
                className={publicChevronClass}
                aria-hidden
              >
                ›
              </PendingLink>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}