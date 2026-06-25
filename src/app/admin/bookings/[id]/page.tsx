import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  StatusBadge,
  Badge,
  inputClass,
  buttonClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  formatMoney,
  formatDate,
  formatTimeRange,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import type {
  Booking,
  BookingAttendance,
  BookingShare,
  Payment,
  Player,
} from "@/lib/types";
import { round2 } from "@/lib/ledger";
import { BookingForm } from "../BookingForm";
import {
  updateBooking,
  setBookingStatus,
  addAttendee,
  addAllActivePlayers,
  setResponse,
  confirmAttendance,
  setPlayerActualStatus,
  generateShares,
  chargeAttendees,
  deleteBooking,
  markBookingSharePaid,
} from "../actions";

export const dynamic = "force-dynamic";

const chargeable = new Set(["attended", "late_cancel", "guest"]);

export default async function BookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();
  if (!booking) notFound();
  const b = booking as Booking;

  const [
    { data: attendance },
    { data: shares },
    { data: payments },
    { data: players },
    { data: balances },
  ] = await Promise.all([
    supabase
      .from("booking_attendance")
      .select("*, players(id, name)")
      .eq("booking_id", id),
    supabase
      .from("booking_shares")
      .select("*, players(id, name)")
      .eq("booking_id", id),
    supabase
      .from("payments")
      .select("*, players(name), player_groups(name)")
      .eq("booking_id", id)
      .order("payment_date", { ascending: false }),
    supabase
      .from("players")
      .select("id, name, active_status")
      .order("name"),
    supabase.from("player_balances").select("*"),
  ]);

  const roster = (attendance ?? []) as (BookingAttendance & {
    players: Pick<Player, "id" | "name">;
  })[];
  const rosterIds = new Set(roster.map((r) => r.player_id));
  const availablePlayers = ((players ?? []) as Player[]).filter(
    (p) => !rosterIds.has(p.id) && p.active_status !== "archived",
  );
  const shareList = (shares ?? []) as (BookingShare & {
    players: Pick<Player, "id" | "name"> | null;
  })[];
  const shareByPlayer = new Map(shareList.map((s) => [s.player_id, s]));
  const shareCountByPlayer = new Map<string | null, number>();
  for (const s of shareList) {
    shareCountByPlayer.set(
      s.player_id,
      (shareCountByPlayer.get(s.player_id) ?? 0) + 1,
    );
  }
  const hasDuplicateShares = [...shareCountByPlayer.values()].some(
    (n) => n > 1,
  );
  const balMap = new Map(
    (balances ?? []).map((x) => [x.player_id as string, Number(x.balance)]),
  );

  const totalShared = round2(
    shareList.reduce((s, x) => s + Number(x.amount_owed), 0),
  );
  // Exclude reversed payments (their ledger credit is voided; they must not
  // count as "paid" or the outstanding figure will be under-stated).
  const paymentList = ((payments ?? []) as (Payment & {
    players: { name: string } | null;
    player_groups: { name: string } | null;
  })[]);
  const isReversed = (p: Payment) =>
    String(p.notes ?? "").startsWith("[REVERSED");
  const paid = round2(
    paymentList
      .filter((p) => !isReversed(p))
      .reduce((s, p) => s + Number(p.amount), 0),
  );
  const today = new Date().toISOString().slice(0, 10);
  const billable = b.status === "booked" || b.status === "played";
  // Show attendance confirmation for played bookings OR booked games whose
  // date has already passed (no need to manually mark as Played first).
  const isPostGame =
    b.status === "played" ||
    (b.status === "booked" && b.play_date < today);
  // Outstanding is what players still owe = charged shares − payments, so it
  // reconciles exactly with the per-player table below (and player balances),
  // instead of the raw court cost which can differ by a few centavos.
  const rawOutstanding = billable ? round2(totalShared - paid) : 0;
  const outstanding =
    Math.abs(rawOutstanding) < SETTLE_TOLERANCE ? 0 : rawOutstanding;
  type ReconLine = {
    key: string;
    name: string;
    kind: "player" | "group";
    charged: number;
    paid: number;
    shareCount: number;
  };
  const reconMap = new Map<string, ReconLine>();
  const ensureLine = (key: string, name: string, kind: "player" | "group") => {
    let line = reconMap.get(key);
    if (!line) {
      line = { key, name, kind, charged: 0, paid: 0, shareCount: 0 };
      reconMap.set(key, line);
    }
    return line;
  };
  for (const s of shareList) {
    if (!s.player_id) continue;
    const line = ensureLine(
      `p:${s.player_id}`,
      s.players?.name ?? "Unknown player",
      "player",
    );
    line.charged += Number(s.amount_owed);
    line.shareCount += 1;
  }
  for (const p of paymentList) {
    if (isReversed(p)) continue; // reversed payments don't count as paid
    if (p.payer_player_id) {
      ensureLine(
        `p:${p.payer_player_id}`,
        p.players?.name ?? "Player",
        "player",
      ).paid += Number(p.amount);
    } else if (p.payer_group_id) {
      ensureLine(
        `g:${p.payer_group_id}`,
        p.player_groups?.name ?? "Group",
        "group",
      ).paid += Number(p.amount);
    }
  }
  const reconLines = [...reconMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div>
      <PageHeader
        title={`${b.booking_code ?? "Booking"}`}
        description={`${formatDate(b.play_date)}${
          b.start_time ? ` · ${formatTimeRange(b.start_time, b.end_time)}` : ""
        }${b.venue ? ` · ${b.venue}` : ""}${
          b.court_number ? ` · ${b.court_number}` : ""
        }${b.booking_reference ? ` · Ref ${b.booking_reference}` : ""}`}
        action={
          <Link href="/admin/bookings" className={buttonClass("ghost")}>
            ← All bookings
          </Link>
        }
      />

      {/* Booking confirmation screenshot */}
      {b.confirmation_url ? (
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <a href={b.confirmation_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.confirmation_url}
              alt="Booking confirmation"
              className="h-20 w-20 rounded-lg object-cover ring-2 ring-emerald-200 hover:ring-emerald-400"
            />
          </a>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Booking confirmation</p>
            <p className="mt-0.5 text-xs text-emerald-600">Court reservation screenshot from the venue.</p>
            <a
              href={b.confirmation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-emerald-700 hover:underline"
            >
              View full image ↗
            </a>
          </div>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total cost
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatMoney(b.total_booking_cost)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {b.courts_booked} court × {b.hours} hr ×{" "}
            {formatMoney(b.rate_per_court_per_hour)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Shares assigned
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatMoney(totalShared)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {Math.abs(totalShared - Number(b.total_booking_cost)) <
            SETTLE_TOLERANCE
              ? "Fully allocated"
              : `${formatMoney(Number(b.total_booking_cost) - totalShared)} unallocated`}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Paid</p>
          <p className="mt-1 text-xl font-semibold text-emerald-600">
            {formatMoney(paid)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Outstanding
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${
              outstanding >= SETTLE_TOLERANCE ? "text-rose-600" : "text-slate-900"
            }`}
          >
            {billable ? formatMoney(outstanding) : "—"}
          </p>
          {!billable ? (
            <p className="mt-1 text-xs text-slate-400">
              {b.status === "refunded" ? "Refunded — not collectible" : "Not collectible"}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={b.status} />
        {(["booked", "played", "cancelled", "refunded"] as const)
          .filter((s) => s !== b.status)
          .map((s) => (
            <ActionForm
              key={s}
              action={setBookingStatus}
              className="inline"
              pendingLabel={`Marking ${s}…`}
              hidden={
                <>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="status" value={s} />
                </>
              }
            >
              <SubmitButton variant="secondary" pendingLabel="…">
                Mark {s}
              </SubmitButton>
            </ActionForm>
          ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ── Roster & Attendance (merged) ── */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">
                  Roster &amp; Attendance
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {b.status === "played"
                    ? "Post-game — confirm who actually attended"
                    : "Pre-game — manage RSVPs"}
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {roster.length} player{roster.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="p-4">
              {roster.length === 0 ? (
                <p className="mb-4 text-sm text-slate-400">
                  No players added yet. Use the form below or let them RSVP
                  via their portal.
                </p>
              ) : isPostGame ? (
                /* ── POST-GAME: attendance confirmation ── */
                <div className="mb-4 space-y-1.5">
                  {[...roster]
                    .sort((a, b) => {
                      const rank = (r: typeof a) => {
                        if (r.actual_status === "attended") {
                          // Sub-sort by RSVP: Going first, then Maybe, No response, Not going
                          if (r.response_status === "going")        return 0;
                          if (r.response_status === "maybe")        return 1;
                          if (r.response_status === "no_response")  return 2;
                          return 3; // not_going but attended
                        }
                        if (!r.actual_status && r.response_status === "going") return 4;
                        if (r.actual_status && r.actual_status !== "absent")   return 5;
                        return 6;
                      };
                      const dr = rank(a) - rank(b);
                      return dr !== 0 ? dr : (a.players?.name ?? "").localeCompare(b.players?.name ?? "");
                    })
                    .map((r) => {
                      const defaultActual =
                        r.actual_status ??
                        (r.response_status === "going" ? "attended" : "absent");
                      const isConfirmedAttended = r.actual_status === "attended";
                      return (
                        <ActionForm
                          key={r.id}
                          action={setPlayerActualStatus}
                          pendingLabel="…"
                          className={`rounded-lg px-3 py-1.5 ${
                            isConfirmedAttended ? "bg-emerald-50" : "bg-slate-50"
                          }`}
                          hidden={
                            <>
                              <input type="hidden" name="booking_id" value={b.id} />
                              <input type="hidden" name="player_id" value={r.player_id} />
                            </>
                          }
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex-1 text-sm ${
                                isConfirmedAttended
                                  ? "font-medium text-emerald-800"
                                  : "text-slate-700"
                              }`}
                            >
                              {r.players?.name}
                            </span>
                            {/* RSVP as a muted hint badge */}
                            <StatusBadge status={r.response_status} />
                            <select
                              name="actual_status"
                              defaultValue={defaultActual}
                              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                            >
                              <option value="attended">Attended</option>
                              <option value="absent">Absent</option>
                              <option value="late_cancel">Late cancel</option>
                              <option value="guest">Guest</option>
                            </select>
                            {isConfirmedAttended ? (
                              <span className="w-20 text-center text-xs font-medium text-emerald-600">
                                ✓ Confirmed
                              </span>
                            ) : (
                              <SubmitButton variant="secondary" pendingLabel="…">
                                Confirm
                              </SubmitButton>
                            )}
                          </div>
                        </ActionForm>
                      );
                    })}
                  <p className="pt-1 text-xs text-slate-400">
                    RSVP badge shown as context. Going players pre-selected as
                    Attended. Change if needed, then click Confirm.
                  </p>
                </div>
              ) : (
                /* ── PRE-GAME: RSVP management ── */
                <ul className="mb-4 space-y-2">
                  {[...roster]
                    .sort((a, b) => {
                      const rsvpRank = (r: typeof a) => {
                        if (r.response_status === "going") return 0;
                        if (r.response_status === "maybe") return 1;
                        if (r.response_status === "no_response") return 2;
                        return 3; // not_going
                      };
                      const dr = rsvpRank(a) - rsvpRank(b);
                      return dr !== 0 ? dr : (a.players?.name ?? "").localeCompare(b.players?.name ?? "");
                    })
                    .map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <span className="font-medium text-slate-700">
                        {r.players?.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.response_status} />
                        {r.actual_status ? (
                          <StatusBadge status={r.actual_status} />
                        ) : null}
                        <ActionForm
                          action={setResponse}
                          className="flex gap-1"
                          pendingLabel="Updating…"
                          hidden={
                            <>
                              <input type="hidden" name="booking_id" value={b.id} />
                              <input type="hidden" name="player_id" value={r.player_id} />
                            </>
                          }
                        >
                          <select
                            name="response_status"
                            defaultValue={r.response_status}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="going">Going</option>
                            <option value="maybe">Maybe</option>
                            <option value="not_going">Not going</option>
                            <option value="no_response">No response</option>
                          </select>
                          <SubmitButton variant="ghost" pendingLabel="…">
                            Set
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add player (always shown) */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <ActionForm
                  action={addAttendee}
                  className="flex-1"
                  pendingLabel="Adding player…"
                  hidden={<input type="hidden" name="booking_id" value={b.id} />}
                >
                  <div className="flex gap-2">
                    <select name="player_id" className={inputClass} required>
                      <option value="">Add player to roster…</option>
                      {availablePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" pendingLabel="Adding…">
                      Add
                    </SubmitButton>
                  </div>
                </ActionForm>
                {availablePlayers.length > 0 ? (
                  <ActionForm
                    action={addAllActivePlayers}
                    pendingLabel="Adding all players…"
                    hidden={<input type="hidden" name="booking_id" value={b.id} />}
                  >
                    <SubmitButton variant="ghost" pendingLabel="Adding…">
                      + Add all active players
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            </div>
          </Card>

          {/* Generate shares */}
          {roster.length > 0 ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-700">
                  Booking shares
                </h2>
                <ConfirmButton
                  action={chargeAttendees}
                  message="Charge everyone who played? This splits the court cost equally across all attended (or RSVP'd going) players and replaces any existing shares."
                  variant="secondary"
                  hidden={{ booking_id: b.id }}
                  pendingLabel="Charging…"
                >
                  ⚡ Charge everyone who attended
                </ConfirmButton>
              </div>
              <ActionForm
                action={generateShares}
                className="p-4"
                pendingLabel="Generating shares…"
                hidden={<input type="hidden" name="booking_id" value={b.id} />}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 font-medium">Include</th>
                        <th className="py-2 font-medium">Player</th>
                        <th className="py-2 font-medium">Units</th>
                        <th className="py-2 font-medium">Override ₱</th>
                        <th className="py-2 text-right font-medium">Current</th>
                        <th className="py-2 text-right font-medium">Wallet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...roster]
                        .sort((a, b) => {
                          // Mirror the defaultInclude logic: existing share OR
                          // chargeable actual_status OR going RSVP = included.
                          const included = (r: typeof a) => {
                            const ex = shareByPlayer.get(r.player_id);
                            return ex != null ||
                              (r.actual_status
                                ? chargeable.has(r.actual_status)
                                : r.response_status === "going");
                          };
                          const ai = included(a) ? 0 : 1;
                          const bi = included(b) ? 0 : 1;
                          if (ai !== bi) return ai - bi;
                          return (a.players?.name ?? "").localeCompare(b.players?.name ?? "");
                        })
                        .map((r) => {
                        const existing = shareByPlayer.get(r.player_id);
                        const defaultInclude =
                          existing != null ||
                          (r.actual_status
                            ? chargeable.has(r.actual_status)
                            : r.response_status === "going");
                        const bal = balMap.get(r.player_id) ?? 0;
                        const credit =
                          bal <= -SETTLE_TOLERANCE ? Math.abs(bal) : 0;
                        return (
                          <tr key={r.id}>
                            <td className="py-2">
                              <input
                                type="hidden"
                                name="share_player_ids"
                                value={r.player_id}
                              />
                              <input
                                type="checkbox"
                                name={`include-${r.player_id}`}
                                defaultChecked={defaultInclude}
                              />
                            </td>
                            <td className="py-2 font-medium text-slate-700">
                              {r.players?.name}
                            </td>
                            <td className="py-2">
                              <input
                                name={`units-${r.player_id}`}
                                type="number"
                                step="0.5"
                                min="0"
                                defaultValue={existing?.share_units ?? 1}
                                className="w-16 rounded-md border border-slate-300 px-2 py-1"
                              />
                            </td>
                            <td className="py-2">
                              <input
                                name={`override-${r.player_id}`}
                                type="number"
                                step="0.01"
                                min="0"
                                defaultValue={
                                  existing?.override_share_amount ?? ""
                                }
                                placeholder="—"
                                className="w-24 rounded-md border border-slate-300 px-2 py-1"
                              />
                            </td>
                            <td className="py-2 text-right text-slate-600">
                              {existing
                                ? formatMoney(existing.amount_owed)
                                : "—"}
                            </td>
                            <td className="py-2 text-right">
                              {credit > 0 ? (
                                <Badge tone="credit">
                                  {formatMoney(credit)}
                                </Badge>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Cost is split by share units across included players. Use
                  Override to set a fixed amount for a player. Regenerating voids
                  and replaces the previous shares.
                </p>
                <div className="mt-3">
                  <ConfirmSubmit
                    message="Generate / regenerate shares? This voids and replaces existing shares for this booking."
                    pendingLabel="Generating…"
                  >
                    Generate shares from this roster
                  </ConfirmSubmit>
                </div>
              </ActionForm>
            </Card>
          ) : null}

          {/* Player shares & payments (merged) */}
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Player shares &amp; payments
              </h2>
              <Link
                href={`/admin/payments?booking=${b.id}`}
                className={buttonClass("secondary")}
              >
                + Record payment
              </Link>
            </div>
            <div className="p-4">
              {reconLines.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No shares or payments recorded for this booking yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 font-medium">Player</th>
                        <th className="py-2 text-right font-medium">Share</th>
                        <th className="py-2 text-right font-medium">Paid</th>
                        <th className="py-2 text-right font-medium">Balance</th>
                        {b.status === "played" ? (
                          <th className="py-2 font-medium" />
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reconLines.map((line) => {
                        const bal = round2(line.charged - line.paid);
                        const settled = Math.abs(bal) < SETTLE_TOLERANCE;
                        const due = bal >= SETTLE_TOLERANCE;
                        return (
                          <tr key={line.key}>
                            <td className="py-2">
                              <span className="font-medium text-slate-700">
                                {line.name}
                              </span>
                              {line.kind === "group" ? (
                                <span className="ml-2 align-middle">
                                  <Badge tone="info">Group</Badge>
                                </span>
                              ) : null}
                              {line.shareCount > 1 ? (
                                <span className="ml-2 align-middle">
                                  <Badge tone="neutral">
                                    {line.shareCount} shares
                                  </Badge>
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 text-right text-slate-600">
                              {line.charged > 0
                                ? formatMoney(line.charged)
                                : "—"}
                            </td>
                            <td className="py-2 text-right text-emerald-600">
                              {line.paid > 0 ? formatMoney(line.paid) : "—"}
                            </td>
                            <td
                              className={`py-2 text-right font-medium ${
                                settled
                                  ? "text-slate-400"
                                  : bal > 0
                                    ? "text-rose-600"
                                    : "text-emerald-600"
                              }`}
                            >
                              {settled
                                ? "Settled"
                                : bal > 0
                                  ? `${formatMoney(bal)} due`
                                  : `${formatMoney(Math.abs(bal))} over`}
                            </td>
                            {b.status === "played" ? (
                              <td className="py-1 pl-3 text-right">
                                {due ? (
                                  <ConfirmButton
                                    action={markBookingSharePaid}
                                    message={`Record ${formatMoney(bal)} payment from ${line.name} for this booking?`}
                                    variant="secondary"
                                    hidden={{
                                      booking_id: b.id,
                                      payer: line.key,
                                      amount: bal.toFixed(2),
                                    }}
                                    pendingLabel="Recording…"
                                  >
                                    Mark paid
                                  </ConfirmButton>
                                ) : null}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 text-sm font-semibold text-slate-700">
                        <td className="py-2">Total</td>
                        <td className="py-2 text-right">
                          {formatMoney(totalShared)}
                        </td>
                        <td className="py-2 text-right text-emerald-700">
                          {formatMoney(paid)}
                        </td>
                        <td className="py-2 text-right">
                          {formatMoney(round2(totalShared - paid))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {hasDuplicateShares ? (
                <p className="mt-3 text-xs text-slate-400">
                  Some players have more than one share. Imported bookings can
                  record multiple shares per player — e.g. when someone covered
                  guests they invited and settled the split on their own.
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        {/* Edit booking */}
        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Edit booking
            </h2>
            <BookingForm action={updateBooking} booking={b} feedback />
          </Card>
          <Card className="border-rose-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-rose-700">
              Danger zone
            </h2>
            <ConfirmButton
              action={deleteBooking}
              message="Delete this booking? If it has shares it will be cancelled instead."
              hidden={{ id: b.id }}
              pendingLabel="Deleting…"
            >
              Delete / cancel booking
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </div>
  );
}
