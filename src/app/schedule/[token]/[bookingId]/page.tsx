import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, StatusBadge, EmptyState } from "@/components/ui";
import { PublicSearchList } from "@/components/PublicSearchList";
import { AddToCalendar } from "@/components/AddToCalendar";
import { getAppBaseUrl } from "@/lib/app-url";
import { formatDate } from "@/lib/format";
import {
  mergeCourts,
  overallCourtTimeRange,
  formatCourtTime,
} from "@/lib/court-format";
import { validatePublicTeamToken } from "@/lib/public-links";
import { loadLinkedIdentities, loadInviteIndex } from "@/lib/accounts";
import { playerFace } from "@/lib/player-identity";
import { inviteLineFromIndex } from "@/lib/player-invite";
import { getAuthContext } from "@/lib/auth";
import { getAdminViewAs } from "@/lib/view-as";
import { isRsvpLocked, getRsvpLockAt } from "@/lib/rsvp-lock";
import { RsvpForm } from "@/app/p/[token]/RsvpForm";
import { PendingLink } from "@/components/PendingLink";
import { PublicChrome } from "@/components/PlayerSessionBar";
import {
  DateChip,
  CountPill,
  CapacityBar,
  publicMainClass,
  publicTapRowClass,
  publicChevronClass,
  publicBackLinkClass,
  publicPrimaryText,
  publicHintText,
  MapsLink,
  WaitlistQueue,
  PlayerNameLine,
  PreviousRsvpList,
} from "@/components/public-ui";
import {
  RememberPublicTokens,
} from "@/components/PublicBottomNav";
import type { Booking, BookingAttendance, Player } from "@/lib/types";
import { compareWaitlistOrder } from "@/lib/waitlist-order";
import { groupPreviousSeats } from "@/lib/previous-rsvp";
import { isSeatStatus, seatHoldBlockReason, seatHoldNote } from "@/lib/seat-hold";
import { holdFeeFromRow, seatHoldsReady } from "@/lib/seat-hold-db";
import { resolveWalletOwner } from "@/lib/ledger";
import {
  groupRsvpGrantOn,
  loadGroupRsvpContext,
  type GroupRsvpGrant,
} from "@/lib/group-rsvp";

export const dynamic = "force-dynamic";

// Responded players (going / waitlist / not going) first, no-response last.
const RSVP_ORDER: Record<string, number> = {
  going: 0,
  waitlist: 1,
  not_going: 2,
  no_response: 3,
  maybe: 3,
};

export default async function PublicBookingRoster({
  params,
}: {
  params: Promise<{ token: string; bookingId: string }>;
}) {
  const { token, bookingId } = await params;
  const db = createAdminClient();
  if (!(await validatePublicTeamToken(db, token))) notFound();

  const { data: booking } = await db
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (!booking) notFound();
  const b = booking as Booking;

  const [{ data: attendance }, { data: courtsData }, identities, inviteIndex, auth] =
    await Promise.all([
      db
        .from("booking_attendance")
        .select(
          "*, players(id, name, display_name, public_token, active_status)",
        )
        .eq("booking_id", bookingId),
      db
        .from("booking_courts")
        .select("court_number, start_time, end_time, hours, max_players")
        .eq("booking_id", bookingId)
        .order("created_at"),
      loadLinkedIdentities(),
      loadInviteIndex(db),
      getAuthContext(),
    ]);

  type Row = BookingAttendance & {
    players: Pick<
      Player,
      "id" | "name" | "display_name" | "public_token" | "active_status"
    >;
  };

  const roster = ((attendance ?? []) as unknown as Row[]).sort((a, b) => {
    const ra = RSVP_ORDER[a.response_status] ?? 9;
    const rb = RSVP_ORDER[b.response_status] ?? 9;
    if (ra !== rb) return ra - rb;
    if (a.response_status === "waitlist") return compareWaitlistOrder(a, b);
    return playerFace(a.player_id, a.players, identities).name.localeCompare(
      playerFace(b.player_id, b.players, identities).name,
    );
  });
  const waitlistNumber = new Map(
    roster
      .filter((r) => r.response_status === "waitlist")
      .map((r, i) => [r.id, i + 1]),
  );
  const waitlistPeople = roster
    .filter((r) => r.response_status === "waitlist")
    .map((r, i) => {
      const face = playerFace(r.player_id, r.players, identities);
      return {
        position: i + 1,
        playerId: r.player_id,
        name: face.name,
        verified: face.verified,
        avatarUrl: face.avatarUrl,
      };
    });

  const previous = groupPreviousSeats(
    roster.map((r) => ({
      playerId: r.player_id,
      name: playerFace(r.player_id, r.players, identities).name,
      previousStatus: r.previous_response_status,
      previousWaitlistedAt: r.previous_waitlisted_at,
      createdAt: r.created_at,
    })),
  );
  const previousWaitByPlayer = new Map(
    previous.waitlist.map((p) => [p.playerId, p.position]),
  );

  const going = roster.filter((r) => r.response_status === "going").length;
  const notGoing = roster.filter((r) => r.response_status === "not_going").length;
  const waitlisted = roster.filter((r) => r.response_status === "waitlist").length;
  const noResponse = roster.length - going - notGoing - waitlisted;

  type CourtInfo = { court_number: string | null; start_time: string | null; end_time: string | null; hours: number; max_players: number };
  const courts = (courtsData ?? []) as CourtInfo[];
  const mergedCourts = mergeCourts(courts);
  const totalMax = mergedCourts.length > 0 && mergedCourts.every((m) => m.maxPlayers > 0)
    ? mergedCourts.reduce((s, m) => s + m.maxPlayers, 0) : 0;
  const overallTime = overallCourtTimeRange(courts);
  const venueLine = [
    b.venue ? `Venue: ${b.venue}` : null,
    overallTime || null,
  ].filter(Boolean).join(" · ");
  const appUrl = await getAppBaseUrl();
  const confirmationUrls =
    b.confirmation_urls && b.confirmation_urls.length > 0
      ? b.confirmation_urls
      : b.confirmation_url
        ? [b.confirmation_url]
        : [];

  const viewAs = await getAdminViewAs();
  const viewerId = viewAs?.playerId ?? auth.profile?.player_id ?? null;
  const groupRsvpByPlayer = new Map<string, GroupRsvpGrant>();
  const groupHoldBalance = new Map<string, number>();
  if (viewerId && roster.length > 0) {
    const rsvpCtx = await loadGroupRsvpContext(
      db,
      roster.map((r) => r.player_id),
    );
    for (const row of roster) {
      if (row.player_id === viewerId) continue;
      const grant = groupRsvpGrantOn(
        rsvpCtx,
        viewerId,
        row.player_id,
        b.play_date,
      );
      if (grant) groupRsvpByPlayer.set(row.player_id, grant);
    }
    const groupIds = [
      ...new Set([...groupRsvpByPlayer.values()].map((g) => g.groupId)),
    ];
    if (groupIds.length > 0) {
      const { data: groupBalances } = await db
        .from("group_balances")
        .select("player_group_id, balance")
        .in("player_group_id", groupIds);
      for (const row of groupBalances ?? []) {
        groupHoldBalance.set(
          row.player_group_id as string,
          Number(row.balance ?? 0),
        );
      }
    }
  }
  const scheduleHoldFee = (await seatHoldsReady(db)) ? holdFeeFromRow(b) : null;
  let scheduleHoldNote: string | null = null;
  let scheduleHoldWarning: string | null = null;
  if (viewerId && scheduleHoldFee != null) {
    const owner = await resolveWalletOwner(db, viewerId, b.play_date);
    const balanceQuery = owner.player_group_id
      ? await db
          .from("group_balances")
          .select("balance")
          .eq("player_group_id", owner.player_group_id)
          .maybeSingle()
      : await db
          .from("player_balances")
          .select("balance")
          .eq("player_id", viewerId)
          .maybeSingle();
    const viewerRow = roster.find((r) => r.player_id === viewerId);
    scheduleHoldNote = seatHoldNote(scheduleHoldFee);
    scheduleHoldWarning = seatHoldBlockReason({
      balance: Number(balanceQuery.data?.balance ?? 0),
      holdFee: scheduleHoldFee,
      alreadyHeld: isSeatStatus(viewerRow?.response_status),
      sharedWallet: Boolean(owner.player_group_id),
    });
  }
  const displayRoster = viewerId
    ? [...roster].sort((a, b) => {
        if (a.player_id === viewerId) return -1;
        if (b.player_id === viewerId) return 1;
        return 0;
      })
    : roster;
  const locked = isRsvpLocked(b.play_date, courts, b.start_time);
  const lockAt = getRsvpLockAt(b.play_date, courts, b.start_time);
  const isFull = totalMax > 0 && going >= totalMax;
  const loginHref = `/login?next=${encodeURIComponent(`/schedule/${token}/${bookingId}`)}`;

  return (
    <PublicChrome returnTo={`/schedule/${token}/${bookingId}`} teamToken={token}>
    <RememberPublicTokens teamToken={token} />
    <main className={publicMainClass}>
      <Link
        href={`/schedule/${token}`}
        className={`mb-4 ${publicBackLinkClass}`}
      >
        ← All upcoming games
      </Link>

      <Card className="mb-5 overflow-visible">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-start gap-4">
            <DateChip value={b.play_date} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h1 className={`text-xl ${publicPrimaryText}`}>
                  {b.booking_code ?? "Booking"}
                </h1>
                <StatusBadge status={b.status} size="sm" />
              </div>
              <p className="mt-0.5 text-sm font-medium text-slate-700">
                {formatDate(b.play_date)}
              </p>
              {venueLine ? (
                <p className={`mt-1.5 ${publicHintText}`}>
                  {b.venue ? (
                    <span className="font-medium text-slate-700">
                      📍 {b.venue}
                    </span>
                  ) : null}
                  {b.venue && overallTime ? " · " : null}
                  {overallTime ? <span>🕐 {overallTime}</span> : null}
                </p>
              ) : null}
              <div className="mt-2">
                <MapsLink venue={b.venue} />
              </div>
            </div>
          </div>

          {mergedCourts.length > 0 ? (
            <div className="mt-3 space-y-0.5 rounded-lg bg-slate-50 px-3 py-2">
              {mergedCourts.map((m, i) => (
                <p key={i} className="text-sm text-slate-700">
                  🏓 <span className="font-medium">{m.label}:</span>{" "}
                  {formatCourtTime(m) || "—"}
                </p>
              ))}
            </div>
          ) : null}

          {b.notes ? (
            <p className={`mt-2 whitespace-pre-wrap ${publicHintText}`}>
              <span className="font-medium">Notes: </span>
              {b.notes}
            </p>
          ) : null}

          {confirmationUrls.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {confirmationUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-emerald-700 hover:underline"
                >
                  📋{" "}
                  {confirmationUrls.length > 1
                    ? `Confirmation ${i + 1}`
                    : "View booking confirmation"}{" "}
                  ↗
                </a>
              ))}
            </div>
          ) : null}
        </div>

        {(roster.length > 0 || totalMax > 0) ? (
          <div className="space-y-3 bg-slate-50/60 p-4">
            {roster.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <CountPill count={going} label="going" tone="going" />
                {waitlisted > 0 ? (
                  <CountPill
                    count={waitlisted}
                    label="waitlisted"
                    tone="waitlist"
                  />
                ) : null}
                <CountPill count={notGoing} label="not going" tone="not_going" />
                {noResponse > 0 ? (
                  <CountPill
                    count={noResponse}
                    label="no response"
                    tone="neutral"
                  />
                ) : null}
              </div>
            ) : null}
            {totalMax > 0 ? (
              <CapacityBar going={going} totalMax={totalMax} />
            ) : null}
            {waitlistPeople.length > 0 ? (
              <WaitlistQueue people={waitlistPeople} />
            ) : null}
          </div>
        ) : null}
      </Card>

      {previous.going.length > 0 || previous.waitlist.length > 0 ? (
        <div className="mb-4">
          <PreviousRsvpList
            going={previous.going}
            waitlist={previous.waitlist}
            viewerPlayerId={viewerId}
          />
        </div>
      ) : null}

      <div className="mb-4">
        <AddToCalendar
          filename={`${b.booking_code ?? "open-play"}.ics`}
          event={{
            uid: b.id,
            title: `${b.booking_code ?? "Open play"} · Dinkering`,
            playDate: b.play_date,
            startTime: courts[0]?.start_time ?? b.start_time,
            endTime: courts[0]?.end_time ?? b.end_time,
            venue: b.venue,
            url: `${appUrl}/schedule/${token}/${bookingId}`,
          }}
        />
      </div>

      {roster.length === 0 ? (
        <EmptyState
          title="No players invited yet"
          description="Once the roster is added, you'll see who's going here."
        />
      ) : (
        <>
          {auth.user ? null : (
            <div className="mb-3">
              <PendingLink
                href={loginHref}
                busyLabel="Opening sign in…"
                className="inline-flex min-h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white"
              >
                Sign in to RSVP
              </PendingLink>
            </div>
          )}
          <PublicSearchList
            placeholder="Search a player…"
            emptyTitle="No player matches your search"
            items={displayRoster.map((r) => {
              const face = playerFace(r.player_id, r.players, identities);
              const invited = inviteLineFromIndex(
                r.player_id,
                inviteIndex,
                identities,
              );
              const mine = viewerId === r.player_id;
              const groupGrant = groupRsvpByPlayer.get(r.player_id) ?? null;
              const canAnswer = mine || !!groupGrant;
              const waitPos = waitlistNumber.get(r.id);
              if (canAnswer) {
                return {
                  key: r.id,
                  search: `${face.name} ${mine ? "You" : "Group"} ${invited ?? ""}`,
                  node: (
                    <div className={mine ? "bg-emerald-50/70 px-4 py-3" : "px-4 py-3"}>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <PlayerNameLine
                            name={face.name}
                            verified={face.verified}
                            avatarUrl={face.avatarUrl}
                            subtitle={
                              mine
                                ? viewAs
                                  ? "Viewing as"
                                  : "You"
                                : groupGrant?.groupName ?? "Your group"
                            }
                          />
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            mine
                              ? "bg-emerald-600 text-white"
                              : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                          }`}
                        >
                          {mine ? (viewAs ? "View as" : "You") : "Group"}
                        </span>
                        <StatusBadge status={r.response_status} size="md" />
                        {r.previous_response_status === "going" ? (
                          <span className="shrink-0 text-xs font-medium text-slate-500">
                            Was Going
                          </span>
                        ) : r.previous_response_status === "waitlist" ? (
                          <span className="shrink-0 text-xs font-medium text-amber-800">
                            Was waitlist #{previousWaitByPlayer.get(r.player_id)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3">
                        <RsvpForm
                          token={r.players.public_token}
                          bookingId={b.id}
                          currentStatus={r.response_status}
                          locked={locked}
                          lockAtIso={lockAt && !locked ? lockAt.toISOString() : null}
                          isFull={isFull}
                          holdNote={scheduleHoldNote}
                          holdWarning={
                            mine
                              ? scheduleHoldWarning
                              : scheduleHoldFee != null && groupGrant
                                ? seatHoldBlockReason({
                                    balance:
                                      groupHoldBalance.get(groupGrant.groupId) ??
                                      0,
                                    holdFee: scheduleHoldFee,
                                    alreadyHeld: isSeatStatus(r.response_status),
                                    sharedWallet: true,
                                  })
                                : null
                          }
                          waitlistPosition={
                            r.response_status === "waitlist" && waitPos
                              ? { position: waitPos, total: waitlistPeople.length }
                              : null
                          }
                        />
                      </div>
                    </div>
                  ),
                };
              }
              const href = `/p/${r.players.public_token}#booking-${bookingId}`;
              const hint = face.verified
                ? invited ?? ""
                : invited
                  ? `${invited} · Open the private page to RSVP`
                  : "Open the private page to RSVP";
              return {
                key: r.id,
                search: `${face.name} ${invited ?? ""}`,
                node: (
                  <Link href={href} className={publicTapRowClass}>
                    <div className="min-w-0 flex-1">
                      <PlayerNameLine
                        name={face.name}
                        verified={face.verified}
                        avatarUrl={face.avatarUrl}
                        subtitle={hint}
                      />
                    </div>
                    <StatusBadge status={r.response_status} size="md" />
                    {r.previous_response_status === "going" ? (
                      <span className="shrink-0 text-xs font-medium text-slate-500">
                        Was Going
                      </span>
                    ) : r.previous_response_status === "waitlist" ? (
                      <span className="shrink-0 text-xs font-medium text-amber-800">
                        Was waitlist #{previousWaitByPlayer.get(r.player_id)}
                      </span>
                    ) : null}
                    {r.response_status === "waitlist" && waitPos ? (
                      <span className="ml-1 text-xs font-semibold text-amber-800">
                        #{waitPos}
                      </span>
                    ) : null}
                    <span className={publicChevronClass} aria-hidden>
                      ›
                    </span>
                  </Link>
                ),
              };
            })}
          />
        </>
      )}

      <p className={`mt-4 px-1 text-center ${publicHintText}`}>
        Your row is at the top when you are signed in. If your group allows
        it, you can also answer for the other members here. Names without a
        login still open their private page.
      </p>

      <footer className="mt-6 text-center text-sm text-slate-400">
        Shared schedule · please don&apos;t post publicly
      </footer>
    </main>
    </PublicChrome>
  );
}
