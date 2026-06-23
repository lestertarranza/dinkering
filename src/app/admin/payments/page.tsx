import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Badge, EmptyState, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { formatMoney, formatDate } from "@/lib/format";
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

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; expense?: string; page?: string }>;
}) {
  const { booking = "", expense = "", page: pageParam } = await searchParams;
  const supabase = await createClient();

  const PAGE_SIZE = 50;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [
    { data: payments, count: paymentCount },
    { data: players },
    { data: groups },
    { data: bookings },
    { data: expenses },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "*, players(name), player_groups(name), bookings(booking_code), team_expenses(expense_code, description)",
        { count: "exact" },
      )
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
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
  ]);

  const total = paymentCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : from + 1;
  const showingTo = Math.min(from + PAGE_SIZE, total);
  const pageQuery = (n: number) => {
    const sp = new URLSearchParams();
    if (booking) sp.set("booking", booking);
    if (expense) sp.set("expense", expense);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return qs ? `/admin/payments?${qs}` : "/admin/payments";
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Record payments and advance credits. Overpayments stay as wallet credit."
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
          {(payments ?? []).length === 0 ? (
            <EmptyState title="No payments yet" />
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
                    href={pageQuery(page - 1)}
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
                    href={pageQuery(page + 1)}
                    className={buttonClass("ghost")}
                  >
                    Older →
                  </Link>
                ) : null}
              </div>
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
