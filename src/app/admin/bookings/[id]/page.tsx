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
import { BookingForm } from "../BookingForm";
import {
  updateBooking,
  setBookingStatus,
  addAttendee,
  setResponse,
  confirmAttendance,
  generateShares,
  deleteBooking,
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
  const balMap = new Map(
    (balances ?? []).map((x) => [x.player_id as string, Number(x.balance)]),
  );

  const totalShared = shareList.reduce((s, x) => s + Number(x.amount_owed), 0);
  const paid = ((payments ?? []) as Payment[]).reduce(
    (s, p) => s + Number(p.amount),
    0,
  );
  const billable = b.status === "booked" || b.status === "played";
  const rawOutstanding = billable ? Number(b.total_booking_cost) - paid : 0;
  const outstanding =
    Math.abs(rawOutstanding) < SETTLE_TOLERANCE ? 0 : rawOutstanding;

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
            <form key={s} action={setBookingStatus}>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="status" value={s} />
              <SubmitButton variant="secondary">Mark {s}</SubmitButton>
            </form>
          ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Roster & RSVP */}
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Roster & RSVP
              </h2>
              <span className="text-xs text-slate-400">
                {roster.length} player{roster.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="p-4">
              {roster.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No players added yet. Add players below or let them RSVP via
                  their portal.
                </p>
              ) : (
                <ul className="space-y-2">
                  {roster.map((r) => (
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
                        <form action={setResponse} className="flex gap-1">
                          <input type="hidden" name="booking_id" value={b.id} />
                          <input
                            type="hidden"
                            name="player_id"
                            value={r.player_id}
                          />
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
                          <SubmitButton variant="ghost">Set</SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form action={addAttendee} className="mt-4 flex gap-2">
                <input type="hidden" name="booking_id" value={b.id} />
                <select name="player_id" className={inputClass} required>
                  <option value="">Add player to roster…</option>
                  {availablePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="secondary">Add</SubmitButton>
              </form>
            </div>
          </Card>

          {/* Confirm attendance */}
          {roster.length > 0 ? (
            <Card>
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Confirm actual attendance
              </h2>
              <form action={confirmAttendance} className="p-4">
                <input type="hidden" name="booking_id" value={b.id} />
                <div className="space-y-2">
                  {roster.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <input
                        type="hidden"
                        name="attendee_ids"
                        value={r.player_id}
                      />
                      <span className="text-sm text-slate-700">
                        {r.players?.name}
                      </span>
                      <select
                        name={`actual-${r.player_id}`}
                        defaultValue={r.actual_status ?? "absent"}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      >
                        <option value="attended">Attended</option>
                        <option value="absent">Absent</option>
                        <option value="late_cancel">Late cancel</option>
                        <option value="guest">Guest</option>
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <SubmitButton>Save attendance</SubmitButton>
                </div>
              </form>
            </Card>
          ) : null}

          {/* Generate shares */}
          {roster.length > 0 ? (
            <Card>
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Booking shares
              </h2>
              <form action={generateShares} className="p-4">
                <input type="hidden" name="booking_id" value={b.id} />
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
                      {roster.map((r) => {
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
                  <ConfirmSubmit message="Generate / regenerate shares? This voids and replaces existing shares for this booking.">
                    Generate shares from this roster
                  </ConfirmSubmit>
                </div>
              </form>
            </Card>
          ) : null}

          {/* Payments for this booking */}
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Payments toward this booking
              </h2>
              <Link
                href={`/admin/payments?booking=${b.id}`}
                className={buttonClass("secondary")}
              >
                + Record payment
              </Link>
            </div>
            <div className="p-4">
              {(payments ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">No payments tagged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(
                    payments as (Payment & {
                      players: { name: string } | null;
                      player_groups: { name: string } | null;
                    })[]
                  ).map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span>
                        {p.players?.name ?? p.player_groups?.name ?? "—"} ·{" "}
                        {formatDate(p.payment_date)}
                      </span>
                      <span className="font-medium text-emerald-600">
                        {formatMoney(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Edit booking */}
        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Edit booking
            </h2>
            <BookingForm action={updateBooking} booking={b} />
          </Card>
          <Card className="border-rose-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-rose-700">
              Danger zone
            </h2>
            <ConfirmButton
              action={deleteBooking}
              message="Delete this booking? If it has shares it will be cancelled instead."
              hidden={{ id: b.id }}
            >
              Delete / cancel booking
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </div>
  );
}
