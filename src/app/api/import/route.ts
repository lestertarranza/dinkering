import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/ledger";

type Row = Record<string, unknown>;

/** Normalize a header: lowercase, strip non-alphanumerics. */
function norm(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Get the first matching value from a row by candidate header names. */
function pick(row: Row, candidates: string[]): unknown {
  const map: Record<string, unknown> = {};
  for (const k of Object.keys(row)) map[norm(k)] = row[k];
  for (const c of candidates) {
    const v = map[norm(c)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown): string {
  if (v === null || v === undefined || String(v).trim() === "")
    return new Date().toISOString().slice(0, 10);
  // Excel serial number
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const d = new Date(String(v));
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const body = (await request.json()) as {
    wipe?: boolean;
    players?: Row[];
    bookings?: Row[];
    playerShares?: Row[];
    payments?: Row[];
    teamExpenses?: Row[];
    expenseShares?: Row[];
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        await runImport(body, emit);
      } catch (e) {
        emit({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

type ImportBody = {
  wipe?: boolean;
  players?: Row[];
  bookings?: Row[];
  playerShares?: Row[];
  payments?: Row[];
  teamExpenses?: Row[];
  expenseShares?: Row[];
};

async function runImport(
  body: ImportBody,
  emit: (obj: unknown) => void,
) {
  const db = createAdminClient();
  const warnings: string[] = [];
  const counts: Record<string, number> = {
    players: 0,
    bookings: 0,
    booking_shares: 0,
    payments: 0,
    team_expenses: 0,
    expense_shares: 0,
    ledger_entries: 0,
  };

  const total =
    (body.players?.length ?? 0) +
    (body.bookings?.length ?? 0) +
    (body.playerShares?.length ?? 0) +
    (body.payments?.length ?? 0) +
    (body.teamExpenses?.length ?? 0) +
    (body.expenseShares?.length ?? 0);
  let processed = 0;
  const tick = (phase: string) => {
    processed++;
    emit({ type: "progress", phase, current: processed, total });
  };

  if (body.wipe) {
    emit({ type: "progress", phase: "Clearing existing data…", current: 0, total });
    for (const t of [
      "ledger_entries",
      "booking_shares",
      "team_expense_shares",
      "booking_attendance",
      "payments",
      "manual_adjustments",
      "team_expenses",
      "bookings",
      "player_group_members",
      "player_groups",
      "players",
    ]) {
      await db.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  // ---- Players ----
  const playerByName = new Map<string, string>();
  for (const row of body.players ?? []) {
    tick("Players");
    const name = str(pick(row, ["name", "player", "playername", "fullname"]));
    if (!name) continue;
    const display_name = str(pick(row, ["displayname", "nickname", "alias"]));
    const statusRaw = (
      str(pick(row, ["status", "activestatus", "active"])) ?? "active"
    ).toLowerCase();
    const active_status = ["inactive", "no", "false"].includes(statusRaw)
      ? "inactive"
      : statusRaw.includes("archive")
        ? "archived"
        : "active";
    const notes = str(pick(row, ["notes", "remarks"]));
    const { data } = await db
      .from("players")
      .insert({ name, display_name, active_status, notes })
      .select("id")
      .single();
    if (data?.id) {
      playerByName.set(name.toLowerCase(), data.id);
      counts.players++;
    }
  }

  async function findPlayer(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    if (playerByName.has(key)) return playerByName.get(key)!;
    const { data } = await db
      .from("players")
      .select("id")
      .ilike("name", name)
      .limit(1);
    if (data?.[0]?.id) {
      playerByName.set(key, data[0].id);
      return data[0].id;
    }
    return null;
  }

  // ---- Bookings ----
  const bookingByCode = new Map<string, { id: string; date: string }>();
  const bookingByDate = new Map<string, { id: string; date: string }>();
  for (const row of body.bookings ?? []) {
    tick("Bookings");
    const code = str(pick(row, ["bookingcode", "bookingid", "code", "id", "ref"]));
    const play_date = toDate(pick(row, ["playdate", "date", "gamedate"]));
    const courts = num(pick(row, ["courtsbooked", "courts", "court"])) || 1;
    const hours = num(pick(row, ["hours", "hrs", "duration"])) || 1;
    const rate = num(
      pick(row, [
        "ratepercourtperhour",
        "ratecourthour",
        "rate",
        "rateperhour",
        "courtrate",
      ]),
    );
    const other = num(pick(row, ["otherfees", "fees", "misc"]));
    const totalGiven = num(
      pick(row, ["totalbookingcost", "total", "totalcost", "amount"]),
    );
    const total = totalGiven > 0 ? totalGiven : round2(courts * hours * rate + other);
    const { data } = await db
      .from("bookings")
      .insert({
        booking_code: code,
        play_date,
        venue: str(pick(row, ["venue", "venuecourt", "location", "court"])),
        courts_booked: courts,
        hours,
        rate_per_court_per_hour: rate,
        other_fees: other,
        total_booking_cost: total,
        status: (() => {
          const s = (str(pick(row, ["status"])) ?? "played").toLowerCase();
          return ["booked", "played", "cancelled", "refunded"].includes(s)
            ? s
            : "played";
        })(),
        notes: str(pick(row, ["notes", "remarks"])),
      })
      .select("id")
      .single();
    if (data?.id) {
      const entry = { id: data.id, date: play_date };
      if (code) bookingByCode.set(code.toLowerCase(), entry);
      bookingByDate.set(play_date, entry);
      counts.bookings++;
    }
  }

  function findBooking(
    code: string | null,
    date: string | null,
  ): { id: string; date: string } | null {
    if (code && bookingByCode.has(code.toLowerCase()))
      return bookingByCode.get(code.toLowerCase())!;
    if (date && bookingByDate.has(date)) return bookingByDate.get(date)!;
    return null;
  }

  // ---- Booking / player shares ----
  for (const row of body.playerShares ?? []) {
    tick("Player shares");
    const playerName = str(pick(row, ["player", "name", "playername"]));
    const player_id = await findPlayer(playerName);
    if (!player_id) {
      warnings.push(`Share skipped: unknown player "${playerName}"`);
      continue;
    }
    const code = str(pick(row, ["bookingcode", "bookingid", "booking", "code"]));
    const date = str(pick(row, ["playdate", "date"]))
      ? toDate(pick(row, ["playdate", "date"]))
      : null;
    const booking = findBooking(code, date);
    if (!booking) {
      warnings.push(
        `Share skipped for ${playerName}: no matching booking (${code ?? date ?? "?"})`,
      );
      continue;
    }
    const units = num(pick(row, ["shareunits", "units", "share"])) || 1;
    const amount = round2(
      num(pick(row, ["amountowed", "amount", "share", "cost"])),
    );
    const { data: share } = await db
      .from("booking_shares")
      .insert({
        booking_id: booking.id,
        player_id,
        share_units: units,
        amount_owed: amount,
      })
      .select("id")
      .single();
    if (share?.id) {
      counts.booking_shares++;
      await db.from("ledger_entries").insert({
        entry_date: booking.date,
        player_id,
        source_type: "booking_share",
        source_id: share.id,
        description: `Court share — ${code ?? "imported"}`,
        debit_amount: amount,
        credit_amount: 0,
      });
      counts.ledger_entries++;
    }
  }

  // ---- Payments ----
  for (const row of body.payments ?? []) {
    tick("Payments");
    const playerName = str(pick(row, ["player", "name", "payer", "playername"]));
    const player_id = await findPlayer(playerName);
    if (!player_id) {
      warnings.push(`Payment skipped: unknown player "${playerName}"`);
      continue;
    }
    const amount = round2(
      num(pick(row, ["amountpaid", "amount", "paid", "payment"])),
    );
    if (amount <= 0) continue;
    const date = toDate(pick(row, ["paymentdate", "datereceived", "date"]));
    const code = str(pick(row, ["bookingcode", "bookingid", "booking"]));
    const booking = findBooking(code, null);
    const { data: pay } = await db
      .from("payments")
      .insert({
        payment_date: date,
        payer_player_id: player_id,
        booking_id: booking?.id ?? null,
        amount,
        payment_method: str(pick(row, ["method", "paymentmethod", "mode"])),
        reference_number: str(pick(row, ["reference", "referencenumber", "ref"])),
        notes: str(pick(row, ["notes", "remarks"])),
      })
      .select("id")
      .single();
    if (pay?.id) {
      counts.payments++;
      await db.from("ledger_entries").insert({
        entry_date: date,
        player_id,
        source_type: "payment",
        source_id: pay.id,
        description: "Imported payment",
        debit_amount: 0,
        credit_amount: amount,
      });
      counts.ledger_entries++;
    }
  }

  // ---- Team expenses ----
  const expenseByKey = new Map<string, { id: string; date: string }>();
  for (const row of body.teamExpenses ?? []) {
    tick("Team expenses");
    const code = str(pick(row, ["expensecode", "expenseid", "code", "id"]));
    const description =
      str(pick(row, ["description", "itemdescription", "item", "expense"])) ??
      "Imported expense";
    const date = toDate(pick(row, ["purchasedate", "date"]));
    const total = round2(num(pick(row, ["totalcost", "total", "amount", "cost"])));
    const buyerName = str(pick(row, ["paidby", "buyer", "player"]));
    const paid_by_player_id = await findPlayer(buyerName);
    const { data: exp } = await db
      .from("team_expenses")
      .insert({
        expense_code: code,
        description,
        purchase_date: date,
        paid_by_player_id,
        total_cost: total,
        split_method: (() => {
          const m = (
            str(pick(row, ["splitmethod", "method"])) ?? "selected_players"
          ).toLowerCase();
          return [
            "active_players",
            "selected_players",
            "attendees",
            "custom",
          ].includes(m)
            ? m
            : "selected_players";
        })(),
        status: "open",
        notes: str(pick(row, ["notes", "remarks"])),
      })
      .select("id")
      .single();
    if (exp?.id) {
      counts.team_expenses++;
      const key = (code ?? description).toLowerCase();
      expenseByKey.set(key, { id: exp.id, date });
      // Buyer reimbursement credit
      if (paid_by_player_id && total > 0) {
        await db.from("ledger_entries").insert({
          entry_date: date,
          player_id: paid_by_player_id,
          source_type: "team_expense_credit",
          source_id: exp.id,
          description: `Reimbursement — ${description}`,
          debit_amount: 0,
          credit_amount: total,
        });
        counts.ledger_entries++;
      }
    }
  }

  // ---- Expense shares ----
  for (const row of body.expenseShares ?? []) {
    tick("Expense shares");
    const playerName = str(pick(row, ["player", "name", "playername"]));
    const player_id = await findPlayer(playerName);
    if (!player_id) {
      warnings.push(`Expense share skipped: unknown player "${playerName}"`);
      continue;
    }
    const key = (
      str(
        pick(row, [
          "expensecode",
          "expenseid",
          "code",
          "expense",
          "description",
          "itemdescription",
          "item",
        ]),
      ) ?? ""
    ).toLowerCase();
    const exp = expenseByKey.get(key);
    if (!exp) {
      warnings.push(`Expense share skipped for ${playerName}: no matching expense (${key})`);
      continue;
    }
    const amount = round2(num(pick(row, ["amountowed", "amount", "share"])));
    const { data: share } = await db
      .from("team_expense_shares")
      .insert({
        team_expense_id: exp.id,
        player_id,
        share_units: num(pick(row, ["shareunits", "units"])) || 1,
        amount_owed: amount,
      })
      .select("id")
      .single();
    if (share?.id) {
      counts.expense_shares++;
      await db.from("ledger_entries").insert({
        entry_date: exp.date,
        player_id,
        source_type: "team_expense_share",
        source_id: share.id,
        description: "Imported expense share",
        debit_amount: amount,
        credit_amount: 0,
      });
      counts.ledger_entries++;
    }
  }

  emit({ type: "done", counts, warnings });
}
