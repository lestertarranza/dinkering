export type RsvpLogVia =
  | "player"
  | "admin"
  | "auto"
  | "auto_going"
  | "view_as"
  | "group";

export type ActivityOrigin = {
  kind: "automatic" | "manual";
  source:
    | "waitlist"
    | "default going"
    | "player page"
    | "admin"
    | "group"
    | "other";
};

export function rsvpLogDetails(via: RsvpLogVia): string {
  if (via === "auto_going") return "Automatic · default Going";
  if (via === "auto") return "Automatic · waitlist";
  if (via === "view_as") return "Manual · club admin viewing as this player";
  if (via === "group") return "Manual · another member of the shared group";
  if (via === "player") return "Manual · player page";
  return "Manual · admin";
}

/**
 * Classify an activity row so admin can tell waitlist auto-fills from a
 * person tapping RSVP. Older rows used "via admin" / "via player page".
 * Court-capacity auto-fills were logged as via admin with no actor email.
 */
export function activityOrigin(row: {
  action: string;
  details: string | null;
  actor_email: string | null;
}): ActivityOrigin {
  const details = row.details ?? "";
  const d = details.toLowerCase();
  const waitlistToGoing = /waitlist\s*(→|->)\s*going/i.test(row.action);

  if (d.includes("viewing as")) {
    return { kind: "manual", source: "admin" };
  }
  if (d.includes("shared group")) {
    return { kind: "manual", source: "group" };
  }
  if (d.includes("default going")) {
    return { kind: "automatic", source: "default going" };
  }
  if (d.startsWith("automatic") || d.includes("automatic ·")) {
    return { kind: "automatic", source: "waitlist" };
  }
  if (d.includes("player page")) {
    return { kind: "manual", source: "player page" };
  }
  if (d.includes("via admin") || d.includes("manual · admin")) {
    if (waitlistToGoing && !row.actor_email) {
      return { kind: "automatic", source: "waitlist" };
    }
    return { kind: "manual", source: "admin" };
  }
  if (d.startsWith("manual")) {
    return {
      kind: "manual",
      source: d.includes("player") ? "player page" : "admin",
    };
  }
  return { kind: "manual", source: "other" };
}
