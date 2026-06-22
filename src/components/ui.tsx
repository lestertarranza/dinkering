import Link from "next/link";
import type { ReactNode } from "react";

type Tone =
  | "collect"
  | "credit"
  | "settled"
  | "paid"
  | "going"
  | "maybe"
  | "not_going"
  | "neutral"
  | "warning"
  | "info"
  | "danger";

const toneClasses: Record<Tone, string> = {
  collect: "bg-rose-100 text-rose-700 ring-rose-200",
  credit: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  settled: "bg-slate-100 text-slate-600 ring-slate-200",
  paid: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  going: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  maybe: "bg-amber-100 text-amber-700 ring-amber-200",
  not_going: "bg-rose-100 text-rose-700 ring-rose-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  warning: "bg-amber-100 text-amber-700 ring-amber-200",
  info: "bg-sky-100 text-sky-700 ring-sky-200",
  danger: "bg-rose-100 text-rose-700 ring-rose-200",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

const statusToneMap: Record<string, Tone> = {
  booked: "info",
  played: "settled",
  cancelled: "neutral",
  refunded: "warning",
  going: "going",
  maybe: "maybe",
  not_going: "not_going",
  no_response: "neutral",
  attended: "going",
  absent: "not_going",
  late_cancel: "warning",
  guest: "info",
  active: "going",
  inactive: "neutral",
  archived: "neutral",
  open: "info",
};

const statusLabelMap: Record<string, string> = {
  no_response: "No response",
  not_going: "Not going",
  late_cancel: "Late cancel",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const tone = statusToneMap[status] ?? "neutral";
  const label =
    statusLabelMap[status] ??
    status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge tone={tone}>{label}</Badge>;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "collect" | "credit" | "info";
}) {
  const accent =
    tone === "collect"
      ? "text-rose-600"
      : tone === "credit"
        ? "text-emerald-600"
        : tone === "info"
          ? "text-sky-600"
          : "text-slate-900";
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  ghost: "text-slate-600 hover:bg-slate-100",
};

export function buttonClass(
  variant: keyof typeof buttonVariants = "primary",
  extra = "",
) {
  return `${buttonBase} ${buttonVariants[variant]} ${extra}`;
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

export const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonVariants;
}) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}
