import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { formatMoney, formatDate } from "@/lib/format";
import type { Booking, Payment, Player, PlayerGroup } from "@/lib/types";
import { PaymentForm } from "./PaymentForm";
import { reversePayment } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking = "" } = await searchParams;
  const supabase = await createClient();

  const [{ data: payments }, { data: players }, { data: groups }, { data: bookings }] =
    await Promise.all([
      supabase
        .from("payments")
        .select("*, players(name), player_groups(name), bookings(booking_code)")
        .order("payment_date", { ascending: false })
        .limit(100),
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
    ]);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Record payments and advance credits. Overpayments stay as wallet credit."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:order-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Record payment
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
            defaultBooking={booking}
          />
        </Card>

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
                })[]
              ).map((p) => {
                const reversed = (p.notes ?? "").startsWith("[REVERSED");
                return (
                  <Card
                    key={p.id}
                    className={`flex items-center justify-between gap-3 p-4 ${
                      reversed ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        {p.players?.name ?? p.player_groups?.name ?? "—"}
                        {reversed ? <Badge tone="neutral">Reversed</Badge> : null}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {p.payment_code} · {formatDate(p.payment_date)}
                        {p.payment_method ? ` · ${p.payment_method}` : ""}
                        {p.reference_number
                          ? ` · ref ${p.reference_number}`
                          : ""}
                        {p.bookings?.booking_code
                          ? ` · ${p.bookings.booking_code}`
                          : " · advance"}
                      </p>
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
          <p className="mt-3 text-center text-xs text-slate-400">
            Showing latest 100 payments.{" "}
            <Link href="/admin" className="text-emerald-600 hover:underline">
              Back to dashboard
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
