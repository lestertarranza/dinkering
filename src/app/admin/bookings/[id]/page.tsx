import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  StatusBadge,
  Badge,
  Field,
  inputClass,
  buttonClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { DownloadCsvButton } from "@/components/DownloadCsvButton";
import { ActivityLog } from "@/components/ActivityLog";
import { fetchActivity } from "@/lib/activity-log";
import {
  formatMoney,
  formatDate,
  formatTimeRange,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import type {
  Booking,
  BookingAttendance,
  BookingCourt,
  BookingShare,
  Player,
  TeamExpense,
} from "@/lib/types";
import { round2 } from "@/lib/ledger";
import { isRsvpLocked } from "@/lib/rsvp-lock";
import { computeBookingShareRemaining } from "@/lib/payment-allocation";
import { BookingForm } from "../BookingForm";
import { BookingExpenseForm } from "../BookingExpenseForm";
import { createBookingExpense } from "@/app/admin/expenses/actions";
import {
  updateBooking,
  setBookingStatus,
  addAttendee,
  addAllActivePlayers,
  setResponse,
  setPlayerActualStatus,
  bulkSetResponse,
  markRemainingAbsent,
  generateShares,
  chargeAttendees,
  deleteBooking,
  markBookingSharePaid,
  removeBookingConfirmation,
  duplicateBooking,
} from "../actions";
import { CourtAddForm } from "../CourtAddForm";
import { CourtRow } from "../CourtRow";
import { CycleRsvpButton } from "@/components/CycleRsvpButton";
import { PlayerDrawerTrigger } from "@/components/PlayerDrawer";
import { SplitPreview } from "@/components/SplitPreview";

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
    { data: courts },
    { data: shares },
    { data: players },
    { data: balances },
    activityRows,
    { data: linkedExpenses },
    { data: expenseGroups },
  ] = await Promise.all([
    supabase
      .from("booking_attendance")
      .select("*, players(id, name)")
      .eq("booking_id", id),
    supabase
      .from("booking_courts")
      .select("*")
      .eq("booking_id", id)
      .order("created_at"),
    supabase
      .from("booking_shares")
      .select("*, players(id, name)")
      .eq("booking_id", id),
    supabase
      .from("players")
      .select("id, name, active_status")
      .order("name"),
    supabase.from("player_balances").select("*"),
    fetchActivity(supabase, "booking", id),
    supabase
      .from("team_expenses")
      .select(
        "id, expense_code, description, total_cost, status, purchase_date, players:paid_by_player_id(name), player_groups:paid_by_group_id(name)",
      )
      .eq("booking_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("player_groups").select("id, name").order("name"),
  ]);

  const roster = (attendance ?? []) as (BookingAttendance & {
    players: Pick<Player, "id" | "name">;
  })[];
  const rosterIds = new Set(roster.map((r) => r.player_id));
  const availablePlayers = ((players ?? []) as Player[]).filter(
    (p) => !rosterIds.has(p.id) && p.active_status !== "archived",
  );
  const confirmationUrls =
    b.confirmation_urls && b.confirmation_urls.length > 0
      ? b.confirmation_urls
      : b.confirmation_url
        ? [b.confirmation_url]
        : [];
  const courtList = (courts ?? []) as BookingCourt[];
  const rsvpLocked = isRsvpLocked(b.play_date, courtList, b.start_time);
  const totalMaxPlayers = courtList.every((c) => c.max_players === 0)
    ? 0
    : courtList.reduce((s, c) => s + c.max_players, 0);

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
  const chargeNames = roster
    .filter((r) =>
      r.actual_status
        ? chargeable.has(r.actual_status)
        : r.response_status === "going",
    )
    .map((r) => r.players?.name ?? "Player");

  const totalShared = round2(
    shareList.reduce((s, x) => s + Number(x.amount_owed), 0),
  );

  // How much of each share has actually been settled. A share is settled by
  // *either* an explicit payment *or* by credit auto-applied from the player's
  // wallet (e.g. a player who carried a credit balance into this booking). We
  // reuse the same FIFO open-charge engine as the player ledger so the booking
  // figures reconcile exactly with what each player still owes.
  // share_id → still-open amount (absent ⇒ fully settled). Accounts for both
  // explicit payments AND credit auto-applied from the player's wallet.
  const remainingByShare = await computeBookingShareRemaining(
    supabase,
    shareList.map((s) => ({
      id: s.id,
      booking_id: b.id,
      player_id: s.player_id,
    })),
    new Map([[b.id, b.play_date]]),
    new Date().toISOString().slice(0, 10),
  );
  const shareRemaining = (shareId: string, amount: number) => {
    const r = remainingByShare.get(shareId);
    return r === undefined ? 0 : Math.min(amount, Math.max(0, r));
  };
  const shareSettled = (shareId: string, amount: number) =>
    round2(amount - shareRemaining(shareId, amount));

  const paid = round2(
    shareList.reduce(
      (s, x) => s + shareSettled(x.id, Number(x.amount_owed)),
      0,
    ),
  );
  const today = new Date().toISOString().slice(0, 10);
  const billable = b.status === "booked" || b.status === "played";
  // Show attendance confirmation for played bookings OR booked games whose
  // date has already passed (no need to manually mark as Played first).
  const isPostGame =
    b.status === "played" ||
    (b.status === "booked" && b.play_date < today);
  // Outstanding is what players still owe = charged shares − settled, so it
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
    const amount = Number(s.amount_owed);
    line.charged += amount;
    line.paid += shareSettled(s.id, amount);
    line.shareCount += 1;
  }
  const reconLines = [...reconMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="pb-36 md:pb-24">
      <PageHeader
        title={`${b.booking_code ?? "Booking"}`}
        description={`${formatDate(b.play_date)}${
          b.start_time ? ` · ${formatTimeRange(b.start_time, b.end_time)}` : ""
        }${b.venue ? ` · ${b.venue}` : ""}${
          b.court_number ? ` · ${b.court_number}` : ""
        }${b.booking_reference ? ` · Ref ${b.booking_reference}` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/bookings/${b.id}/print`} className={buttonClass("secondary")}>
              Print sheet
            </Link>
            <form action={duplicateBooking}>
              <input type="hidden" name="id" value={b.id} />
              <button type="submit" className={buttonClass("secondary")}>
                Duplicate session
              </button>
            </form>
            <Link href="/admin/bookings" className={buttonClass("ghost")}>
              ← All bookings
            </Link>
          </div>
        }
      />

      {/* Booking confirmation screenshot */}
      {confirmationUrls.length > 0 ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            Booking confirmation{confirmationUrls.length > 1 ? "s" : ""}
          </p>
          <p className="mt-0.5 text-xs text-emerald-600">
            Court reservation screenshot{confirmationUrls.length > 1 ? "s" : ""} from the venue.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {confirmationUrls.map((url, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Booking confirmation ${i + 1}`}
                    className="h-20 w-20 rounded-lg object-cover ring-2 ring-emerald-200 hover:ring-emerald-400"
                  />
                </a>
                <ConfirmButton
                  action={removeBookingConfirmation}
                  message="Remove this confirmation screenshot?"
                  variant="ghost"
                  hidden={{ booking_id: b.id, url }}
                  pendingLabel="Removing…"
                >
                  Remove
                </ConfirmButton>
              </div>
            ))}
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
        {(["for_booking", "booked", "played", "cancelled", "refunded"] as const)
          .filter((s) => s !== b.status)
          .map((s) => {
            const label: Record<string, string> = {
              for_booking: "For Booking",
              booked: "Booked",
              played: "Played",
              cancelled: "Cancelled",
              refunded: "Refunded",
            };
            return (
              <ActionForm
                key={s}
                action={setBookingStatus}
                className="inline"
                pendingLabel={`Marking ${label[s]}…`}
                hidden={
                  <>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="status" value={s} />
                  </>
                }
              >
                <SubmitButton variant="secondary" pendingLabel="…">
                  Mark {label[s]}
                </SubmitButton>
              </ActionForm>
            );
          })}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">

          {/* ── Courts ── */}
          <Card id="add-court">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Courts</h2>
                {totalMaxPlayers > 0 ? (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Max {totalMaxPlayers} player{totalMaxPlayers === 1 ? "" : "s"} total
                  </p>
                ) : courtList.length > 0 ? (
                  <p className="mt-0.5 text-xs text-slate-400">Unlimited capacity</p>
                ) : null}
              </div>
            </div>
            <div className="p-4 space-y-4">
              {courtList.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No courts added yet. Add courts below — at least one is required before generating shares.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                        <th className="py-2 font-medium">Court #</th>
                        <th className="py-2 font-medium">Start</th>
                        <th className="py-2 font-medium">End</th>
                        <th className="py-2 text-right font-medium">Hours</th>
                        <th className="py-2 text-right font-medium">Rate / hr</th>
                        <th className="py-2 text-right font-medium">Max players</th>
                        <th className="py-2 text-right font-medium">Subtotal</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courtList.map((c) => (
                        <CourtRow key={c.id} court={c} />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 font-semibold">
                        <td className="py-2 text-slate-700" colSpan={6}>Total court cost</td>
                        <td className="py-2 text-right text-slate-700">
                          {formatMoney(courtList.reduce((s, c) => s + c.hours * c.rate_per_court_per_hour, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <CourtAddForm bookingId={b.id} />
            </div>
          </Card>

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
                  {rsvpLocked
                    ? " · Going players within 24h of game time are committed and charged by default"
                    : ""}
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {roster.length} player{roster.length === 1 ? "" : "s"}
              </span>
            </div>

            {roster.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
                <DownloadCsvButton
                  filename={`${b.booking_code ?? "roster"}-rsvp.csv`}
                  label="Export roster CSV"
                  rows={[
                    ["Name", "RSVP", "Attendance"],
                    ...roster.map((r) => [
                      r.players?.name ?? "",
                      r.response_status,
                      r.actual_status ?? "",
                    ]),
                  ]}
                />
                {isPostGame ? (
                  <ActionForm
                    action={markRemainingAbsent}
                    pendingLabel="Marking remaining absent…"
                    hidden={
                      <input type="hidden" name="booking_id" value={b.id} />
                    }
                  >
                    <SubmitButton variant="secondary" pendingLabel="…">
                      Mark remaining Absent
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <ActionForm
                    id="bulk-rsvp"
                    action={bulkSetResponse}
                    className="flex flex-wrap items-center gap-2"
                    pendingLabel="Updating selected…"
                    hidden={
                      <input type="hidden" name="booking_id" value={b.id} />
                    }
                  >
                    <select
                      name="response_status"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      defaultValue="going"
                    >
                      <option value="going">Going</option>
                      <option value="not_going">Not going</option>
                      <option value="no_response">No response</option>
                      <option value="waitlist">Waitlist</option>
                    </select>
                    <SubmitButton variant="secondary" pendingLabel="…">
                      Apply to selected
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            ) : null}

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
                          // Sub-sort by RSVP: Going first, then no response, not going
                          if (r.response_status === "going")        return 0;
                          if (r.response_status === "no_response" || r.response_status === "maybe") return 1;
                          return 2; // not_going but attended
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
                            {rsvpLocked && r.response_status === "going" ? (
                              <Badge tone="warning">Committed</Badge>
                            ) : null}
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
                      // Responded first (going → waitlist → not going), then no response
                      const rsvpRank = (r: typeof a) => {
                        if (r.response_status === "going") return 0;
                        if (r.response_status === "waitlist") return 1;
                        if (r.response_status === "not_going") return 2;
                        return 3; // no_response / leftover maybe last
                      };
                      const dr = rsvpRank(a) - rsvpRank(b);
                      return dr !== 0 ? dr : (a.players?.name ?? "").localeCompare(b.players?.name ?? "");
                    })
                    .map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <label className="flex min-w-0 flex-1 items-center gap-2 font-medium text-slate-700">
                        <input
                          type="checkbox"
                          form="bulk-rsvp"
                          name="player_ids"
                          value={r.player_id}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <PlayerDrawerTrigger
                          payload={{
                            name: r.players?.name ?? "Player",
                            playerHref: `/admin/players/${r.player_id}`,
                            rsvp: r.response_status,
                            attendance: r.actual_status,
                            balanceLabel:
                              (balMap.get(r.player_id) ?? 0) >= SETTLE_TOLERANCE
                                ? `${formatMoney(balMap.get(r.player_id) ?? 0)} owed`
                                : null,
                          }}
                        >
                          {r.players?.name}
                        </PlayerDrawerTrigger>
                      </label>
                      <div className="flex items-center gap-2">
                        {rsvpLocked && r.response_status === "going" ? (
                          <Badge tone="warning">Committed</Badge>
                        ) : null}
                        <StatusBadge status={r.response_status} />
                        <CycleRsvpButton
                          bookingId={b.id}
                          playerId={r.player_id}
                          current={r.response_status}
                        />
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

          <Card>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Session extras (team expenses)
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Balls or other fees for this game. They also appear under Team
                Expenses.
              </p>
            </div>
            {(linkedExpenses ?? []).length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {(
                  (linkedExpenses ?? []) as unknown as (Pick<
                    TeamExpense,
                    "id" | "expense_code" | "description" | "total_cost" | "status"
                  > & {
                    players: { name: string } | null;
                    player_groups: { name: string } | null;
                  })[]
                ).map((ex) => (
                  <li key={ex.id}>
                    <Link
                      href={`/admin/expenses/${ex.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {ex.description}
                          {ex.status === "reversed" ? (
                            <Badge tone="neutral">Reversed</Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-400">
                          {ex.expense_code} · paid by{" "}
                          {ex.players?.name ?? ex.player_groups?.name ?? "—"}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-900">
                        {formatMoney(ex.total_cost)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-slate-400">
                No extras on this session yet.
              </p>
            )}
            <div className="border-t border-slate-100 p-4">
              <ActionForm
                action={createBookingExpense}
                pendingLabel="Adding extra…"
              >
                <BookingExpenseForm
                  bookingId={b.id}
                  players={((players ?? []) as Player[])
                    .filter((p) => p.active_status !== "archived")
                    .map((p) => ({ id: p.id, name: p.name }))}
                  groups={(expenseGroups ?? []) as { id: string; name: string }[]}
                />
              </ActionForm>
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
              <SplitPreview
                totalCost={Number(b.total_booking_cost)}
                playerNames={chargeNames}
              />
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
          <Card className="p-4" id="edit-booking">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Edit booking
            </h2>
            <BookingForm action={updateBooking} booking={b} feedback />
          </Card>
          <Card>
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Activity log
            </h2>
            <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
              RSVP changes for this booking (from a player&apos;s private page or from
              this roster).
            </p>
            <ActivityLog rows={activityRows} />
          </Card>
          <Card className="border-rose-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-rose-700">
              Danger zone
            </h2>
            <ConfirmButton
              action={deleteBooking}
              message="Delete this booking? If it already has shares the booking will be cancelled instead of permanently deleted. This cannot be undone from the UI."
              hidden={{ id: b.id }}
              pendingLabel="Deleting…"
            >
              Delete / cancel booking
            </ConfirmButton>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-6px_16px_rgba(15,23,42,0.12)] backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-medium text-slate-600">
            {b.booking_code ?? "Booking"} ·{" "}
            <span className="capitalize">{b.status.replaceAll("_", " ")}</span>
          </p>
          {b.status === "booked" || b.status === "for_booking" ? (
            <ActionForm
              action={setBookingStatus}
              className="inline"
              pendingLabel="Marking Played…"
              hidden={
                <>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="status" value="played" />
                </>
              }
            >
              <SubmitButton pendingLabel="…">Mark Played</SubmitButton>
            </ActionForm>
          ) : null}
          <a href="#edit-booking" className={buttonClass("secondary")}>
            Save / edit
          </a>
          <a href="#add-court" className={buttonClass("secondary")}>
            Add court
          </a>
        </div>
      </div>
    </div>
  );
}
