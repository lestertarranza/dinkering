/** Google Maps search URL for a venue name. */
export function mapsSearchUrl(venue: string | null | undefined): string | null {
  const q = venue?.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function goingChipLabel(p: {
  name: string;
  display_name: string | null;
  hidden_on_board?: boolean | null;
}): string | null {
  if (p.hidden_on_board) return null;
  return p.display_name?.trim() || p.name;
}
