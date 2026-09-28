/**
 * Public-page RSVP: unclaimed names still use the private link.
 * Claimed / registered names can only be changed by that player's login.
 * Admin RSVP stays on the booking roster, not on /p/[token].
 */
export function canEditPublicRsvp(opts: {
  claimed: boolean;
  viewerPlayerId: string | null | undefined;
  targetPlayerId: string;
}): boolean {
  if (!opts.claimed) return true;
  return opts.viewerPlayerId === opts.targetPlayerId;
}
