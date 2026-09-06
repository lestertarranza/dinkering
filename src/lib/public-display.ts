/** Google Maps search URL for a venue name. */
export function mapsSearchUrl(venue: string | null | undefined): string | null {
  const q = venue?.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** First name, or first name + last initial for a full name. */
export function publicShortName(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Player";
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

export function goingChipLabel(p: {
  name: string;
  display_name: string | null;
  hidden_on_board?: boolean | null;
}): string | null {
  if (p.hidden_on_board) return null;
  const label = p.display_name?.trim() || p.name;
  return publicShortName(label);
}
