/**
 * One-off: retarget EXP-026..029 (Aug 14–Sep 5, 2026 pickleball Team Expenses)
 * onto the Pickleballs club item as fundraising. Player shares stay as
 * collected vs unpaid. Does not record a pot purchase; those rows were a fund
 * before Club items existed. Buyer wallet credits stay as they were.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const FUND_ID = "134c201b-16f1-4945-b1be-2d9e890fdd58";
const EXPENSE_IDS = [
  "8058cdfa-d445-4b0c-ae32-7fa28d414f3b", // EXP-026
  "d219e33b-68c8-4705-99d7-7e285ff9cf19", // EXP-027
  "e22be01e-e6ea-49f8-8560-a847ab83e3a9", // EXP-028
  "4b2d45a3-f22a-4195-882c-8dc987122da8", // EXP-029
];

function fail(msg, extra) {
  console.error(msg, extra ?? "");
  process.exit(1);
}

const { data: fund, error: fundErr } = await db
  .from("club_item_funds")
  .select("id, name")
  .eq("id", FUND_ID)
  .single();
if (fundErr || !fund) fail("Pickleballs fund not found", fundErr?.message);
if (fund.name !== "Pickleballs") fail(`Unexpected fund name: ${fund.name}`);

const { data: expenses, error: expErr } = await db
  .from("team_expenses")
  .select(
    "id, expense_code, description, purchase_date, total_cost, status, booking_id, paid_by_player_id, paid_by_group_id, notes",
  )
  .in("id", EXPENSE_IDS)
  .order("purchase_date");
if (expErr) fail("Could not load expenses", expErr.message);

for (const exp of expenses ?? []) {
  const { data: already } = await db
    .from("club_fund_entries")
    .select("id")
    .eq("team_expense_id", exp.id)
    .eq("voided", false)
    .limit(1);
  if ((already ?? []).length > 0) {
    console.log(`SKIP ${exp.expense_code} already converted`);
    continue;
  }
  if (exp.status === "reversed") {
    fail(`${exp.expense_code} is reversed and has no club item rows. Stop.`);
  }

  const { data: oldShares, error: shErr } = await db
    .from("team_expense_shares")
    .select("id, player_id, amount_owed")
    .eq("team_expense_id", exp.id);
  if (shErr) fail(`Shares for ${exp.expense_code}`, shErr.message);
  if (!oldShares?.length) fail(`${exp.expense_code} has no shares`);
  if (oldShares.some((s) => !s.player_id)) {
    fail(`${exp.expense_code} has a share with no player_id`);
  }

  const desc = (exp.description || "Pickleballs").trim();
  const code = exp.expense_code || "expense";
  const amount = Number(exp.total_cost);

  const { data: allocate, error: aErr } = await db
    .from("club_fund_entries")
    .insert({
      fund_id: FUND_ID,
      kind: "allocate",
      amount,
      entry_date: exp.purchase_date,
      description: `${desc} · ${code}`,
      booking_id: exp.booking_id,
      team_expense_id: exp.id,
    })
    .select("id")
    .single();
  if (aErr || !allocate) fail(`Allocate ${code}`, aErr?.message);

  for (const old of oldShares) {
    const { data: created, error: nsErr } = await db
      .from("club_fund_shares")
      .insert({
        fund_entry_id: allocate.id,
        player_id: old.player_id,
        amount_owed: Number(old.amount_owed),
      })
      .select("id")
      .single();
    if (nsErr || !created) fail(`Club share ${code} ${old.id}`, nsErr?.message);
    const { error: uErr } = await db
      .from("ledger_entries")
      .update({
        source_type: "club_fund_share",
        source_id: created.id,
        description: `Club item contribution · Pickleballs · ${code}`,
      })
      .eq("source_type", "team_expense_share")
      .eq("source_id", old.id)
      .eq("voided", false);
    if (uErr) fail(`Ledger share ${old.id}`, uErr.message);
  }

  const { error: cErr } = await db
    .from("ledger_entries")
    .update({
      source_type: "club_fund_credit",
      source_id: allocate.id,
      description: `Pickleballs reimbursement · ${desc} (${code})`,
    })
    .eq("source_type", "team_expense_credit")
    .eq("source_id", exp.id)
    .eq("voided", false);
  if (cErr) fail(`Ledger credit ${code}`, cErr.message);

  const note = `Converted to Pickleballs club item (in pot) ${new Date().toISOString().slice(0, 10)}.`;
  const { error: rErr } = await db
    .from("team_expenses")
    .update({
      status: "reversed",
      notes: exp.notes ? `${exp.notes}\n${note}` : note,
    })
    .eq("id", exp.id);
  if (rErr) fail(`Reverse ${code}`, rErr.message);

  console.log(
    `OK ${code} ${exp.purchase_date} ${amount} shares=${oldShares.length} booking=${exp.booking_id ?? "none"}`,
  );
}

console.log("DONE");
