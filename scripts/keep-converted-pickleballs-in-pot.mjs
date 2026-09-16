/**
 * Correction: EXP-026..029 were fundraising (In pot), not club-item purchases.
 * Void the spend rows without touching buyer ledger credits or player shares.
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

const { data: spends, error: sErr } = await db
  .from("club_fund_entries")
  .select("id, amount, description, voided, team_expense_id")
  .eq("fund_id", FUND_ID)
  .eq("kind", "spend")
  .in("team_expense_id", EXPENSE_IDS);
if (sErr) fail("Could not load spends", sErr.message);

const open = (spends ?? []).filter((s) => !s.voided);
if (open.length === 0) {
  console.log("No open converted spends to remove. Already fundraising-only.");
  process.exit(0);
}

const { data: allocates, error: aErr } = await db
  .from("club_fund_entries")
  .select("id, team_expense_id")
  .eq("fund_id", FUND_ID)
  .eq("kind", "allocate")
  .eq("voided", false)
  .in("team_expense_id", EXPENSE_IDS);
if (aErr) fail("Could not load allocate rows", aErr.message);
const allocateByExpense = new Map(
  (allocates ?? []).map((e) => [e.team_expense_id, e.id]),
);

for (const s of open) {
  const allocateId = allocateByExpense.get(s.team_expense_id);
  if (!allocateId) fail(`No allocate row for spend ${s.id}`);
  const { error: cErr } = await db
    .from("ledger_entries")
    .update({ source_id: allocateId })
    .eq("source_type", "club_fund_credit")
    .eq("source_id", s.id)
    .eq("voided", false);
  if (cErr) fail(`Retarget credit ${s.id}`, cErr.message);
}

const total = open.reduce((s, e) => s + Number(e.amount), 0);
const { error: dErr } = await db
  .from("club_fund_entries")
  .delete()
  .in(
    "id",
    open.map((s) => s.id),
  );
if (dErr) fail("Could not delete spends", dErr.message);

for (const s of open) {
  console.log(`REMOVED spend ${s.id} amount=${s.amount} ${s.description}`);
}
console.log(
  `DONE removed ${open.length} spends totaling ${total}. Buyer credits and player shares unchanged.`,
);
