/** Google Maps search URL for a venue name. */
export function mapsSearchUrl(venue: string | null | undefined): string | null {
  const q = venue?.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export { goingChipLabel } from "@/lib/player-identity";
