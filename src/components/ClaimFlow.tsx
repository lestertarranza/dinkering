"use client";

import { useState, useTransition } from "react";
import { searchClaimPlayers } from "@/app/auth/actions";
import { publicPlayerLabel } from "@/lib/public-links";
import { MIN_CLAIM_SEARCH, type ClaimSearchHit } from "@/lib/account-fields";
import { AccountRequestForm } from "@/components/AccountRequestForm";
import { submitClaim } from "@/app/auth/actions";
import { inputClass } from "@/components/ui";

export function ClaimFlow({
  preset,
  defaultEmail,
  needPassword,
}: {
  preset?: { id: string; name: string; display_name: string | null };
  defaultEmail?: string;
  needPassword: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ClaimSearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ClaimSearchHit | null>(
    preset
      ? {
          id: preset.id,
          name: preset.name,
          display_name: preset.display_name,
          pending: false,
        }
      : null,
  );
  const [pending, start] = useTransition();

  if (selected) {
    return (
      <div className="space-y-3">
        {!preset ? (
          <button
            type="button"
            className="text-sm font-medium text-emerald-700"
            onClick={() => setSelected(null)}
          >
            Choose a different name
          </button>
        ) : null}
        <AccountRequestForm
          action={submitClaim}
          kind="claim"
          playerId={selected.id}
          playerLabel={publicPlayerLabel(selected)}
          defaultEmail={defaultEmail}
          needPassword={needPassword}
          submitLabel="Submit claim"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Type your name to find yourself. We do not show the full list here.
      </p>
      <input
        type="search"
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          setError(null);
          if (v.trim().length < MIN_CLAIM_SEARCH) {
            setHits([]);
            return;
          }
          start(async () => {
            const res = await searchClaimPlayers(v);
            setHits(res.players);
            setError(res.error ?? null);
          });
        }}
        placeholder="Your name"
        className={inputClass}
        autoComplete="off"
      />
      {pending ? (
        <p className="text-xs text-slate-400">Searching…</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {q.trim().length >= MIN_CLAIM_SEARCH && !pending && hits.length === 0 && !error ? (
        <p className="text-sm text-slate-500">
          No unclaimed names matched. If you are new, register instead.
        </p>
      ) : null}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {hits.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              disabled={h.pending}
              onClick={() => {
                if (h.pending) return;
                setSelected(h);
              }}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="font-medium text-slate-900">
                {publicPlayerLabel(h)}
              </span>
              {h.pending ? (
                <span className="text-xs text-amber-700">Claim pending</span>
              ) : (
                <span className="text-xs text-emerald-700">This is me</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
