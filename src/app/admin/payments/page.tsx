import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Badge, EmptyState, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { formatMoney, formatDate } from "@/lib/format";
import { round2 } from "@/lib/ledger";
import { buildAutomaticSettlements } from "@/lib/settlement-audit";
import type {
  Booking,
  Payment,
  Player,
  PlayerGroup,
  TeamExpense,
} from "@/lib/types";
import { PaymentForm } from "./PaymentForm";
import { BulkPaymentForm } from "./BulkPaymentForm";
import { reversePayment } from "./actions";

export const dynamic = "force-dynamic";

type Category = "all" | "court" | "expense" | "credit";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "court", label: "Court bookings" },
  { key: "expense", label: "Team expenses" },
  { key: "credit", label: "Advance & credit" },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    booking?: string;
    expense?: string;
    page?: string;
    apage?: string;
    cat?: string;
  }>;
}) {
  const {
    booking = "",
    expense = "",
    page: pageParam,
    apage: apageParam,
    cat: catParam,
  } = await searchParams;
  const cat: Category = (["all", "court", "expense", "credit"].includes(
    catParam ?? "",
  )
    ? catParam
    : "all") as Category;
  const supabase = await createClient();

  const PAGE_SIZE = 20;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const apage = Math.max(1, parseInt(apageParam ?? "1", 10) || 1);

  // Paginated list of real payment rows, filtered to the active category.
  let listQuery = supabase
    .from("payments")
    .select(
      "*, screenshot_url, players(name), player_groups(name), bookings(booking_code), team_expenses(expense_code, description)",
      { count: "exact" },
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (cat === "court") listQuery = listQuery.not("booking_id", "is", null);
  else if (cat === "expense")
    listQuery = listQuery.not("team_expense_id", "is", null);
  else if (cat === "credit")
    listQuery = listQuery
      .is("booking_id", null)
      .is("team_expense_id", null);

  const [
    { data: payments, count: paymentCount },
    { data: summaryRows },
    { data: players },
    { data: groups },
    { data: bookings },
    { data: expenses },
    audit,
  ] = await Promise.all([
    listQuery.range(from, to),
    supabase
      .from("payments")
      .select("amount, notes, booking_id, team_expense_id"),
    supabase
      .from("players")
      .select("id, name")
      .neq("active_status", "archived")
      .order("name"),
    supabase.from("player_groups").select("id, name").order("name"),
    supabase
      .from("bookings")
      .select("id, booking_code, play_date")
      .order("play_date", { ascending: false })
      .limit(50),
    supabase
      .from("team_expenses")
      .select("id, expense_code, description")
      .eq("status", "open")
      .order("purchase_date", { ascending: false })
      .limit(50),
    buildAutomaticSettlements(supabase),
  ]);

  // Per-category "money received" totals (real payments, excluding reversed).
  const received = { court: 0, expense: 0, credit: 0 };
  const counts = { court: 0, expense: 0, credit: 0 };
  for (const r of (summaryRows ?? []) as {
    amount: number;
    notes: string | null;
    booking_id: string | null;
    team_expense_id: string | null;
  }[]) {
    if ((r.notes ?? "").startsWith("[REVERSED")) continue;
    const amt = Number(r.amount);
    if (r.booking_id) {
      received.court = round2(received.court + amt);
      counts.court += 1;
    } else if (r.team_expense_id) {
      received.expense = round2(received.expense + amt);
      counts.expense += 1;
    } else {
      received.credit = round2(received.credit + amt);
      counts.credit += 1;
    }
  }

  const total = paymentCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : from + 1;
  const showingTo = Math.min(from + PAGE_SIZE, total);
  const linkFor = (next: { cat?: Category; page?: number; apage?: number }) => {
    const sp = new URLSearchParams();
    if (booking) sp.set("booking", booking);
    if (expense) sp.set("expense", expense);
    const c = next.cat ?? cat;
    if (c !== "all") sp.set("cat", c);
    const p = next.page ?? (next.cat !== undefined ? 1 : page);
    if (p > 1) sp.set("page", String(p));
    const ap = next.apage ?? (next.cat !== undefined ? 1 : apage);
    if (ap > 1) sp.set("apage", String(ap));
    const qs = sp.toString();
    return qs ? `/admin/payments?${qs}` : "/admin/payments";
  };

  const autoAll =
    cat === "court"
      ? audit.court
      : cat === "expense"
        ? audit.expense
        : cat === "credit"
          ? []
          : [...audit.court, ...audit.expense].sort((a, b) =>
              a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
            );
  const autoTotal =
    cat === "court"
      ? audit.courtTotal
      : cat === "expense"
        ? audit.expenseTotal
        : cat === "credit"
          ? 0
          : round2(audit.courtTotal + audit.expenseTotal);
  const AUTO_PAGE_SIZE = 20;
  const autoTotalCount = autoAll.length;
  const autoTotalPages = Math.max(1, Math.ceil(autoTotalCount / AUTO_PAGE_SIZE));
  const autoFrom = (apage - 1) * AUTO_PAGE_SIZE;
  const autoForCat = autoAll.slice(autoFrom, autoFrom + AUTO_PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Record payments and advance credits. Overpayments stay as wallet credit, then auto-settle the oldest charges."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:order-2">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Bulk payment
            </h2>
            <BulkPaymentForm
              players={(players ?? []) as Pick<Player, "id" | "name">[]}
              groups={(groups ?? []) as Pick<PlayerGroup, "id" | "name">[]}
            />
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Single payment
            </h2>
            <PaymentForm
              players={(players ?? []) as Pick<Player, "id" | "name">[]}
              groups={(groups ?? []) as Pick<PlayerGroup, "id" | "name">[]}
              bookings={
                (bookings ?? []) as Pick<
                  Booking,
                  "id" | "booking_code" | "play_date"
                >[]
              }
              expenses={
                (expenses ?? []) as Pick<
                  TeamExpense,
                  "id" | "expense_code" | "description"
                >[]
              }
              defaultBooking={booking}
              defaultExpense={expense}
            />
          </Card>
        </div>

        <div className="lg:order-1 lg:col-span-2">
          {/* Category segregation tabs */}
          <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {CATEGORIES.map((c) => {
              const active = c.key === cat;
              const badge =
                c.key === "court"
                  ? counts.court
                  : c.key === "expense"
                    ? counts.expense
                    : c.key === "credit"
                      ? counts.credit
                      : counts.court + counts.expense + counts.credit;
              return (
                <Link
                  key={c.key}
                  href={linkFor({ cat: c.key, page: 1 })}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {c.label}
                  <span className="ml-1.5 text-xs text-slate-400">{badge}</span>
                </Link>
              );
            })}
          </div>

          {/* Per-category settlement summary */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {cat === "court"
                  ? "Collected for court bookings"
                  : cat === "expense"
                    ? "Collected for team expenses"
                    : cat === "credit"
                      ? "Advance / general credit"
                      : "Payments recorded"}
              </p>
              <p className="mt-1 text-xl font-semibold text-emerald-600">
                {formatMoney(
                  cat === "court"
                    ? received.court
                    : cat === "expense"
                      ? received.expense
                      : cat === "credit"
                        ? received.credit
                        : round2(
                            received.court + received.expense + received.credit,
                          ),
                )}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Money actually received and recorded as payments.
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Auto-settled from credit / group funds
              </p>
              <p className="mt-1 text-xl font-semibold text-sky-600">
                {formatMoney(autoTotal)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Charges covered by existing wallet credit — no new payment.
              </p>
            </Card>
          </div>

          {/* Real payments list — shown first */}
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Payments received
          </h2>
          {(payments ?? []).length === 0 ? (
            <EmptyState title="No payments in this category yet" />
          ) : (
            <div className="space-y-2">
              {(
                payments as (Payment & {
                  players: { name: string } | null;
                  player_groups: { name: string } | null;
                  bookings: { booking_code: string } | null;
                  team_expenses: {
                    expense_code: string | null;
                    description: string;
                  } | null;
                  screenshot_url: string | null;
                })[]
              ).map((p) => {
                const note = p.notes ?? "";
                const reversed = note.startsWith("[REVERSED");
                const isBulk = note.includes("Bulk settlement");
                const appliedTo = p.bookings?.booking_code
                  ? `Court ${p.bookings.booking_code}`
                  : p.team_expenses
                    ? `Expense ${p.team_expenses.expense_code ?? p.team_expenses.description}`
                    : isBulk
                      ? "Bulk split"
                      : "Advance / general credit";
                const catTone = p.booking_id
                  ? "neutral"
                  : p.team_expense_id
                    ? "warning"
                    : "settled";
                const catLabel = p.booking_id
                  ? "Court"
                  : p.team_expense_id
                    ? "Team expense"
                    : "Advance";
                // Funding trail: the per-slice note left by bulk settlement,
                // cleaned of the leading "[REVERSED …]" / "Bulk settlement ·".
                const trail = note
                  .replace(/^\[REVERSED[^\]]*\]\s*/, "")
                  .replace(/^Bulk settlement · /, "")
                  .trim();
                return (
                  <Card
                    key={p.id}
                    className={`flex items-center justify-between gap-3 p-4 ${
                      reversed ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                        {p.players?.name ?? p.player_groups?.name ?? "—"}
                        <Badge tone={catTone}>{catLabel}</Badge>
                        {isBulk ? <Badge tone="info">Auto-allocated</Badge> : null}
                        {reversed ? <Badge tone="neutral">Reversed</Badge> : null}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {p.payment_code} · {formatDate(p.payment_date)}
                        {p.payment_method ? ` · ${p.payment_method}` : ""}
                        {p.reference_number
                          ? ` · ref ${p.reference_number}`
                          : ""}
                        {` · ${appliedTo}`}
                      </p>
                      {trail && trail !== appliedTo ? (
                        <p className="mt-1 text-xs text-slate-500">
                          ↳ {trail}
                        </p>
                      ) : null}
                      {p.screenshot_url ? (
                        <a
                          href={p.screenshot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.screenshot_url}
                            alt="Payment screenshot"
                            className="h-8 w-8 rounded object-cover ring-1 ring-slate-200"
                          />
                          View screenshot ↗
                        </a>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-semibold ${
                          reversed
                            ? "text-slate-400 line-through"
                            : "text-emerald-600"
                        }`}
                      >
                        {formatMoney(p.amount)}
                      </span>
                      {!reversed ? (
                        <ConfirmButton
                          action={reversePayment}
                          message="Reverse this payment? Its ledger credit will be voided."
                          variant="ghost"
                          hidden={{ id: p.id }}
                          pendingLabel="Reversing…"
                        >
                          Reverse
                        </ConfirmButton>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {total > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                Showing {showingFrom}–{showingTo} of {total} payment
                {total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={linkFor({ page: page - 1 })}
                    className={buttonClass("ghost")}
                  >
                    ← Newer
                  </Link>
                ) : null}
                <span className="text-xs text-slate-400">
                  Page {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={linkFor({ page: page + 1 })}
                    className={buttonClass("ghost")}
                  >
                    Older →
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Auto-settled section — below payments received */}
          {cat !== "credit" && autoAll.length > 0 ? (
            <div className="mt-8">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                Auto-settled from credit / group funds
                <Badge tone="info">{autoAll.length}</Badge>
              </h2>
              <div className="space-y-2">
                {autoForCat.map((s) => {
                  const href =
                    s.category === "court"
                      ? `/admin/bookings/${s.parentId}`
                      : `/admin/expenses/${s.parentId}`;
                  return (
                    <Card
                      key={s.id}
                      className="flex items-center justify-between gap-3 border-sky-100 bg-sky-50/40 p-4"
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                          {s.payerName}
                          <Badge tone="info">Auto</Badge>
                          <Badge
                            tone={s.category === "court" ? "neutral" : "warning"}
                          >
                            {s.category === "court" ? "Court" : "Team expense"}
                          </Badge>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          <Link href={href} className="hover:underline">
                            {s.chargeLabel}
                          </Link>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatDate(s.date)} · {s.fundingLabel}
                        </p>
                      </div>
                      <span className="font-semibold text-sky-700">
                        {formatMoney(s.amount)}
                      </span>
                    </Card>
                  );
                })}
              </div>
              {autoTotalCount > AUTO_PAGE_SIZE ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-400">
                    Showing {autoFrom + 1}–
                    {Math.min(autoFrom + AUTO_PAGE_SIZE, autoTotalCount)} of{" "}
                    {autoTotalCount} auto-settlement
                    {autoTotalCount === 1 ? "" : "s"}
                  </p>
                  <div className="flex items-center gap-2">
                    {apage > 1 ? (
                      <Link
                        href={linkFor({ apage: apage - 1 })}
                        className={buttonClass("ghost")}
                      >
                        ← Newer
                      </Link>
                    ) : null}
                    <span className="text-xs text-slate-400">
                      Page {apage} / {autoTotalPages}
                    </span>
                    {apage < autoTotalPages ? (
                      <Link
                        href={linkFor({ apage: apage + 1 })}
                        className={buttonClass("ghost")}
                      >
                        Older →
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="mt-3 text-center text-xs text-slate-400">
            <Link href="/admin" className="text-emerald-600 hover:underline">
              Back to dashboard
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
