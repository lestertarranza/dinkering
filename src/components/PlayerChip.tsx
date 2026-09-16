export function PlayerAvatar({
  name,
  src,
  size = "sm",
  verified = false,
}: {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  verified?: boolean;
}) {
  const dim =
    size === "lg"
      ? "h-16 w-16 text-xl"
      : size === "md"
        ? "h-10 w-10 text-sm"
        : size === "xs"
          ? "h-6 w-6 text-[10px]"
          : "h-8 w-8 text-xs";
  const ring = verified ? "ring-2 ring-emerald-500" : "ring-1 ring-slate-200";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`${dim} ${ring} shrink-0 rounded-full object-cover`}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={`${dim} ${ring} inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600`}
    >
      {initial}
    </span>
  );
}

export function PlayerChip({
  name,
  src,
  verified,
  size = "xs",
  hint,
  nested = false,
}: {
  name: string;
  src?: string | null;
  verified?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  hint?: string;
  nested?: boolean;
}) {
  const label = hint ? `${name} (${hint})` : name;
  const a11y = verified ? `${label}, verified` : label;
  const avatar = (
    <PlayerAvatar name={name} src={src} size={size} verified={verified} />
  );
  const tip = (
    <span
      role="tooltip"
      className="player-chip-tip pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg"
    >
      {label}
    </span>
  );

  if (nested) {
    return (
      <span className="player-chip relative inline-flex" aria-label={a11y}>
        {avatar}
        {tip}
      </span>
    );
  }

  return (
    <span className="player-chip relative inline-flex">
      <button
        type="button"
        aria-label={a11y}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1"
      >
        {avatar}
      </button>
      {tip}
    </span>
  );
}
