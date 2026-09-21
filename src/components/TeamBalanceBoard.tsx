"use client";

import { Fragment, useMemo, useState } from "react";
import { Card, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { PlayerAvatar, PlayerChip } from "@/components/PlayerChip";
import {
  publicChevronClass,
  publicHintText,
  publicPrimaryText,
  publicTapRowClass,
} from "@/components/public-ui";
import { PendingLink } from "@/components/PendingLink";

export type BalanceBucket = "owe" | "credit" | "settled";

export type BalanceItem = {
  key: string;
  search: string;
  bucket: BalanceBucket;
  href: string;
  name: string;
  subtitle?: string;
  tone: "collect" | "credit" | "settled";
  amount: number;
  avatarUrl?: string | null;
  verified?: boolean;
  avatars?: { name: string; src?: string | null; verified?: boolean }[];
};

export function TeamBalanceBoard({
  items,
  minToShowSearch = 8,
  totals,
}: {
  items: BalanceItem[];
  minToShowSearch?: number;
  totals?: { owed: number; credit: number };
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? items.filter((i) => i.search.toLowerCase().includes(needle))
        : items,
    [items, needle],
  );

  const credit = filtered.filter((i) => i.bucket === "credit");
  const owe = filtered.filter((i) => i.bucket === "owe");
  const settled = filtered.filter((i) => i.bucket === "settled");

  return (
    <>
      {items.length >= minToShowSearch ? (
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

      {totals ? (
        <div className="mb-3 flex flex-wrap justify-center gap-1.5">
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
            Total owed {formatMoney(totals.owed)}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            {formatMoney(totals.credit)} in credit
          </span>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title="No player matches your search" />
      ) : (
        <div className="space-y-4">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <BalanceColumn
              title="In credit"
              tone="credit"
              items={credit}
              emptyLabel="No one has credit right now."
            />
            <BalanceColumn
              title="Owes the team"
              tone="owe"
              items={owe}
              emptyLabel="Everyone's paid up — nice!"
            />
          </div>
          {settled.length > 0 ? (
            <BalanceColumn title="Settled up" tone="settled" items={settled} />
          ) : null}
        </div>
      )}
    </>
  );
}

function BalanceColumn({
  title,
  tone,
  items,
  emptyLabel,
}: {
  title: string;
  tone: BalanceBucket;
  items: BalanceItem[];
  emptyLabel?: string;
}) {
  const accent =
    tone === "owe"
      ? "text-rose-600"
      : tone === "credit"
        ? "text-emerald-600"
        : "text-slate-500";
  return (
    <section>
      <h2
        className={`mb-2 px-1 text-xs font-bold uppercase tracking-wide ${accent}`}
      >
        {title}
        {items.length > 0 ? (
          <span className="text-slate-400"> · {items.length}</span>
        ) : null}
      </h2>
      {items.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-slate-400">
          {emptyLabel}
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100 overflow-visible">
          {items.map((i) => (
            <Fragment key={i.key}>
              <BalanceRow item={i} />
            </Fragment>
          ))}
        </Card>
      )}
    </section>
  );
}

function BalanceRow({ item }: { item: BalanceItem }) {
  const color =
    item.tone === "collect"
      ? "text-rose-700"
      : item.tone === "credit"
        ? "text-emerald-700"
        : "text-slate-400";
  return (
    <PendingLink
      href={item.href}
      busyLabel="Opening page…"
      className={publicTapRowClass}
    >
      {item.avatars && item.avatars.length > 0 ? (
        <span className="flex shrink-0 -space-x-2">
          {item.avatars.slice(0, 3).map((a, i) => (
            <PlayerChip
              key={`${a.name}-${i}`}
              name={a.name}
              src={a.src}
              size="sm"
              verified={a.verified}
              nested
            />
          ))}
        </span>
      ) : (
        <PlayerAvatar
          name={item.name}
          src={item.avatarUrl}
          size="sm"
          verified={item.verified}
        />
      )}
      <div className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] ${publicPrimaryText}`}>
          {item.name}
        </span>
        {item.subtitle ? (
          <p className={`truncate text-xs ${publicHintText}`}>{item.subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-right">
        <p className={`text-base font-bold ${color}`}>
          {item.tone === "settled" ? "—" : formatMoney(item.amount)}
        </p>
        <span className={publicChevronClass} aria-hidden>
          ›
        </span>
      </div>
    </PendingLink>
  );
}