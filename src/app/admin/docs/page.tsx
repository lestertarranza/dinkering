import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const sectionClass = "mt-10 first:mt-0";
const h2Class = "mb-4 text-xl font-bold text-slate-900";
const h3Class = "mb-2 mt-6 text-base font-semibold text-slate-800";
const pClass = "text-sm leading-relaxed text-slate-600";
const liClass = "text-sm leading-relaxed text-slate-600";
const codeClass =
  "rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700";
const tableClass = "w-full border-collapse text-sm";
const thClass =
  "border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
const tdClass = "border border-slate-200 px-3 py-2 text-slate-600";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "players", label: "Players & Groups" },
  { id: "bookings", label: "Bookings & Court Shares" },
  { id: "expenses", label: "Team Expenses" },
  { id: "payments", label: "Payments" },
  { id: "bulk-payment", label: "Bulk Payment" },
  { id: "transfer", label: "Balance Transfer" },
  { id: "collections", label: "Collections" },
  { id: "balances", label: "Understanding Balances" },
  { id: "public-pages", label: "Public Pages" },
  { id: "faq", label: "FAQ" },
];

export default function DocsPage() {
  return (
    <div>
      <PageHeader
        title="Help & Documentation"
        description="Complete guide to managing Dinkering Pickleball Team finances."
      />

      <div className="flex gap-8 lg:flex-row flex-col">
        {/* Sticky table of contents */}
        <aside className="lg:w-52 shrink-0">
          <nav className="sticky top-5 space-y-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Contents
            </p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-10">

          {/* ── Overview ── */}
          <Card className="p-6" id="overview">
            <div className={sectionClass}>
              <h2 className={h2Class}>Overview</h2>
              <p className={pClass}>
                Dinkering is a finance tracker for a pickleball team. It records
                court bookings, team expenses, and player payments using a
                double-entry ledger, then shows each player their balance and
                transaction history on a private public page.
              </p>
              <h3 className={h3Class}>Core concepts</h3>
              <ul className="ml-4 list-disc space-y-1">
                <li className={liClass}>
                  <strong>Wallet</strong> — every player (or group) has a wallet.
                  Charges add debit, payments add credit. Balance = debit − credit.
                </li>
                <li className={liClass}>
                  <strong>FIFO</strong> — credits are applied to the oldest charges
                  first. Overpayments become advance credit for future charges.
                </li>
                <li className={liClass}>
                  <strong>Group wallet</strong> — when a player belongs to a pooled
                  group (couple / family / team fund), all their charges route to the
                  group wallet instead of their personal wallet.
                </li>
                <li className={liClass}>
                  <strong>Settle tolerance</strong> — amounts within ₱0.50 of zero
                  are treated as fully settled (avoids centavo noise from rounding).
                </li>
              </ul>
              <h3 className={h3Class}>Typical workflow</h3>
              <ol className="ml-4 list-decimal space-y-1">
                <li className={liClass}>Create players and groups.</li>
                <li className={liClass}>
                  Record a booking → generate shares → this charges each player.
                </li>
                <li className={liClass}>
                  Record payments → charges are auto-settled oldest-first.
                </li>
                <li className={liClass}>
                  Share the team board link — players see their balance and history.
                </li>
                <li className={liClass}>
                  Use Collections to identify who owes and send reminders.
                </li>
              </ol>
            </div>
          </Card>

          {/* ── Players & Groups ── */}
          <Card className="p-6" id="players">
            <h2 className={h2Class}>Players &amp; Groups</h2>

            <h3 className={h3Class}>Players</h3>
            <p className={pClass}>
              Go to <Link href="/admin/players" className="text-emerald-700 hover:underline">Players</Link> to manage
              the roster.
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li className={liClass}>
                <strong>Name</strong> — used internally and in admin views.
              </li>
              <li className={liClass}>
                <strong>Display name</strong> — shown on the public board and player
                portal (e.g. a nickname). Falls back to Name if blank.
              </li>
              <li className={liClass}>
                <strong>Status</strong> — Active players are included when splitting
                costs; Inactive are excluded from auto-splits; Archived have history
                preserved but cannot be charged.
              </li>
              <li className={liClass}>
                <strong>Public link / QR</strong> — each player gets a unique private
                URL. Share this so they can check their own balance and respond to
                games.
              </li>
            </ul>

            <h3 className={h3Class}>Groups / Pooled funds</h3>
            <p className={pClass}>
              Groups allow a couple, family, or shared fund to have a single
              combined wallet. Go to{" "}
              <Link href="/admin/groups" className="text-emerald-700 hover:underline">Groups / Funds</Link>.
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li className={liClass}>
                <strong>Types:</strong> Couple · Family · Team fund. Only these types
                are treated as pooled wallets.
              </li>
              <li className={liClass}>
                <strong>Primary member</strong> — the member whose name appears first
                in shared contexts. Affects wallet routing priority when a member
                belongs to multiple groups.
              </li>
              <li className={liClass}>
                <strong>Group token / link</strong> — the group also gets its own
                public page showing all member charges and the shared balance.
              </li>
              <li className={liClass}>
                <strong>Pull member balances</strong> — if a player has personal
                wallet credit (e.g. from a payment before they joined the group), use
                this to move that credit into the group wallet where it can offset
                group charges.
              </li>
            </ul>

            <h3 className={h3Class}>Manual adjustments</h3>
            <p className={pClass}>
              On any player or group page you can post a manual{" "}
              <strong>charge</strong> (adds debt) or <strong>credit</strong>{" "}
              (removes debt). Always provide a clear reason — it appears in the
              player&apos;s ledger history.
            </p>
          </Card>

          {/* ── Bookings ── */}
          <Card className="p-6" id="bookings">
            <h2 className={h2Class}>Bookings &amp; Court Shares</h2>

            <h3 className={h3Class}>Creating a booking</h3>
            <ol className="ml-4 list-decimal space-y-1">
              <li className={liClass}>
                Go to{" "}
                <Link href="/admin/bookings" className="text-emerald-700 hover:underline">Bookings</Link> →{" "}
                <em>New booking</em>.
              </li>
              <li className={liClass}>
                Enter date, venue, courts booked, hours, rate per court/hour, and any
                other fees. The total is auto-calculated.
              </li>
              <li className={liClass}>
                Add players to the attendance roster (or use <em>Add all active
                players</em>).
              </li>
              <li className={liClass}>
                Set attendance responses and actual attendance as the game happens.
              </li>
            </ol>

            <h3 className={h3Class}>Generating shares</h3>
            <p className={pClass}>
              After attendance is confirmed, click <strong>Generate shares</strong>{" "}
              (or <strong>Charge attendees</strong>). This divides the total booking
              cost equally among chargeable players (attended / late cancel / guest)
              and posts a debit to each player&apos;s wallet.
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li className={liClass}>
                <strong>Custom shares</strong> — you can override the share amount or
                unit weighting per player before generating.
              </li>
              <li className={liClass}>
                <strong>Regenerating shares</strong> — if attendance changes, you can
                regenerate. Old entries are voided and new ones are created.
              </li>
              <li className={liClass}>
                <strong>Booking status</strong> — set to <em>Played</em> once the
                game is done so it appears in historical reports.
              </li>
            </ul>

            <h3 className={h3Class}>Outstanding / reconciliation</h3>
            <p className={pClass}>
              Each booking detail page shows the{" "}
              <strong>per-payer reconciliation table</strong>: what each player was
              charged, what they&apos;ve paid (for this booking specifically), and
              their per-booking balance. The overall outstanding equals total shares
              minus total non-reversed payments tagged to this booking.
            </p>
          </Card>

          {/* ── Team Expenses ── */}
          <Card className="p-6" id="expenses">
            <h2 className={h2Class}>Team Expenses</h2>
            <p className={pClass}>
              Use{" "}
              <Link href="/admin/expenses" className="text-emerald-700 hover:underline">Team Expenses</Link>{" "}
              to track shared purchases like balls, shuttlecocks, or equipment that
              are split among players.
            </p>

            <h3 className={h3Class}>Creating an expense</h3>
            <ol className="ml-4 list-decimal space-y-1">
              <li className={liClass}>
                Enter the description, purchase date, who paid (<em>Paid by</em>),
                total cost, and split method.
              </li>
              <li className={liClass}>
                The person who paid gets a <strong>reimbursement credit</strong> in
                their wallet equal to the total cost.
              </li>
              <li className={liClass}>
                Each included player gets a <strong>share charge</strong> in their
                wallet.
              </li>
            </ol>

            <h3 className={h3Class}>Split methods</h3>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Method</th>
                  <th className={thClass}>Who gets charged</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={tdClass}>All active players</td>
                  <td className={tdClass}>Everyone with Active status</td>
                </tr>
                <tr>
                  <td className={tdClass}>Selected players</td>
                  <td className={tdClass}>Only those you check</td>
                </tr>
                <tr>
                  <td className={tdClass}>Booking attendees</td>
                  <td className={tdClass}>Players who attended a linked booking</td>
                </tr>
                <tr>
                  <td className={tdClass}>Custom</td>
                  <td className={tdClass}>Manually specify each player&apos;s share</td>
                </tr>
              </tbody>
            </table>

            <h3 className={h3Class}>&quot;Who has paid&quot; section</h3>
            <p className={pClass}>
              On each expense&apos;s detail page, the <em>Who has paid</em> table
              shows each player&apos;s share, how much is settled (via wallet FIFO),
              and how much remains outstanding. A player whose wallet already has
              enough credit appears as <em>Settled</em> automatically — no manual
              payment needed.
            </p>

            <h3 className={h3Class}>Reversing an expense</h3>
            <p className={pClass}>
              Use <em>Reverse expense</em> to void all shares and the buyer
              reimbursement. The expense stays in history marked as Reversed. Use
              this if the purchase was cancelled or recorded by mistake.
            </p>
          </Card>

          {/* ── Payments ── */}
          <Card className="p-6" id="payments">
            <h2 className={h2Class}>Payments</h2>
            <p className={pClass}>
              Go to{" "}
              <Link href="/admin/payments" className="text-emerald-700 hover:underline">Payments</Link>{" "}
              to record money received from players.
            </p>

            <h3 className={h3Class}>Single payment</h3>
            <p className={pClass}>
              Record an individual payment. Fields:
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li className={liClass}>
                <strong>Payer</strong> — the player or group paying.
              </li>
              <li className={liClass}>
                <strong>Amount</strong> — amount received.
              </li>
              <li className={liClass}>
                <strong>For booking</strong> — optional; tag the payment to a
                specific booking. This links it on the booking detail page.
              </li>
              <li className={liClass}>
                <strong>For team expense</strong> — optional; tag to a specific
                expense.
              </li>
              <li className={liClass}>
                <strong>Method / Reference number</strong> — GCash, cash, bank
                transfer, etc. and the transaction reference.
              </li>
            </ul>
            <p className="mt-2 text-xs text-slate-400">
              Tip: leaving <em>For booking</em> and <em>For team expense</em> blank
              records it as an advance / general credit, which FIFO will apply to the
              player&apos;s oldest outstanding charge.
            </p>

            <h3 className={h3Class}>Reversing a payment</h3>
            <p className={pClass}>
              Click <em>Reverse</em> on any payment row. This voids the ledger
              credit entry and marks the payment as reversed. The payment row remains
              for the audit trail but no longer reduces any balance.
            </p>

            <h3 className={h3Class}>Payment categories (tabs)</h3>
            <p className={pClass}>
              The Payments page has tabs to filter by:
              <strong> All · Court bookings · Team expenses · Advance &amp; credit</strong>.
              An <em>Auto-settled</em> section below shows charges that were settled
              from wallet credit (not from direct tagged payments).
            </p>
          </Card>

          {/* ── Bulk Payment ── */}
          <Card className="p-6" id="bulk-payment">
            <h2 className={h2Class}>Bulk Payment</h2>
            <p className={pClass}>
              Bulk payment lets a player pay a lump sum that is automatically split
              across their oldest outstanding charges (FIFO) — courts first, then
              expenses. Each charge allocation becomes its own payment record.
            </p>

            <h3 className={h3Class}>How to use it</h3>
            <ol className="ml-4 list-decimal space-y-1">
              <li className={liClass}>
                Go to{" "}
                <Link href="/admin/payments" className="text-emerald-700 hover:underline">Payments</Link>{" "}
                and open the <em>Bulk payment</em> panel.
              </li>
              <li className={liClass}>Select the payer — their open charges load automatically.</li>
              <li className={liClass}>
                Enter the amount. A live preview shows how the amount will be
                allocated to each charge.
              </li>
              <li className={liClass}>
                Add method, reference, and notes, then click <em>Record bulk
                payment</em>.
              </li>
            </ol>

            <h3 className={h3Class}>Overpayment</h3>
            <p className={pClass}>
              If the amount exceeds total charges, the remainder is recorded as an
              advance credit — it will auto-apply to the player&apos;s next charge.
            </p>
          </Card>

          {/* ── Balance Transfer ── */}
          <Card className="p-6" id="transfer">
            <h2 className={h2Class}>Balance Transfer</h2>
            <p className={pClass}>
              Use a balance transfer when you need to move outstanding charges from
              one player to another — for example, if a player leaves the team and
              another player takes over their debt.
            </p>

            <h3 className={h3Class}>How to transfer a balance</h3>
            <ol className="ml-4 list-decimal space-y-1">
              <li className={liClass}>
                Go to the source player&apos;s admin page (
                <Link href="/admin/players" className="text-emerald-700 hover:underline">Players</Link>{" "}
                → click the player).
              </li>
              <li className={liClass}>
                Click the <em>Transfer balance</em> button at the top right.
              </li>
              <li className={liClass}>
                Select which charges to transfer (individual checkboxes or{" "}
                <em>Select all</em>).
              </li>
              <li className={liClass}>
                Choose the target player, set the date, and optionally add a note.
              </li>
              <li className={liClass}>Review the preview and click <em>Transfer</em>.</li>
            </ol>

            <h3 className={h3Class}>What happens under the hood</h3>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li className={liClass}>
                A <strong>credit</strong> equal to the transfer amount is posted to
                the source player&apos;s wallet, removing their debt.
              </li>
              <li className={liClass}>
                An equivalent <strong>charge</strong> is posted to the target
                player&apos;s wallet, adding the debt there.
              </li>
              <li className={liClass}>
                Both ledger entries include a description listing the specific charges
                that were transferred, preserving the audit trail.
              </li>
              <li className={liClass}>
                Group wallet routing is respected — if either player is in a pooled
                group, the transfer posts to the group wallet.
              </li>
            </ul>

            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              <strong>Note:</strong> A balance transfer does not re-assign the
              underlying booking share or expense share records. The original booking
              and expense pages will still show the source player. The transfer only
              moves the financial obligation via ledger entries.
            </div>
          </Card>

          {/* ── Collections ── */}
          <Card className="p-6" id="collections">
            <h2 className={h2Class}>Collections</h2>
            <p className={pClass}>
              The{" "}
              <Link href="/admin/collections" className="text-emerald-700 hover:underline">Collections</Link>{" "}
              page shows every player (and group) with an outstanding balance, sorted
              by amount owed.
            </p>

            <h3 className={h3Class}>Payment reminder messages</h3>
            <p className={pClass}>
              Click <em>Copy reminder</em> next to any player to copy a pre-filled
              message that includes their balance, GCash number, bank transfer
              details, and their personal portal link. Paste it straight into your
              group chat.
            </p>

            <h3 className={h3Class}>GCash &amp; bank transfer settings</h3>
            <p className={pClass}>
              Set your GCash number and bank transfer details on the Collections page.
              These are embedded in all reminder messages.
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li className={liClass}>
                <strong>GCash number</strong> — e.g. <code className={codeClass}>09XX XXX XXXX</code>
              </li>
              <li className={liClass}>
                <strong>Bank transfer details</strong> — e.g.{" "}
                <code className={codeClass}>BDO · John Doe · 1234567890</code>
              </li>
            </ul>

            <h3 className={h3Class}>CSV export</h3>
            <p className={pClass}>
              Click <em>Export balances (CSV)</em> to download a spreadsheet of all
              current player and group balances.
            </p>
          </Card>

          {/* ── Understanding Balances ── */}
          <Card className="p-6" id="balances">
            <h2 className={h2Class}>Understanding Balances</h2>

            <h3 className={h3Class}>Wallet routing</h3>
            <p className={pClass}>
              When a charge (court share, expense share) is created for a player:
            </p>
            <table className={tableClass + " mt-2"}>
              <thead>
                <tr>
                  <th className={thClass}>Player situation</th>
                  <th className={thClass}>Charge goes to</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={tdClass}>In a couple / family / team fund group</td>
                  <td className={tdClass}>Group wallet</td>
                </tr>
                <tr>
                  <td className={tdClass}>Not in any such group</td>
                  <td className={tdClass}>Personal wallet</td>
                </tr>
              </tbody>
            </table>

            <h3 className={h3Class}>FIFO credit application</h3>
            <p className={pClass}>
              Credits (payments, reimbursements) within a wallet are applied to the
              oldest outstanding charge first. This means:
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li className={liClass}>
                An advance payment will automatically settle the player&apos;s next
                charge.
              </li>
              <li className={liClass}>
                A new charge is immediately offset by any existing wallet credit.
              </li>
              <li className={liClass}>
                Credits in one wallet do <strong>not</strong> automatically flow to
                another wallet.
              </li>
            </ul>

            <h3 className={h3Class}>Key scenarios</h3>
            <table className={tableClass + " mt-2"}>
              <thead>
                <tr>
                  <th className={thClass}>Situation</th>
                  <th className={thClass}>Result</th>
                  <th className={thClass}>Action needed</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={tdClass}>Non-pooled player with wallet credit, new charge arrives</td>
                  <td className={tdClass}>Auto-settled ✅</td>
                  <td className={tdClass}>None</td>
                </tr>
                <tr>
                  <td className={tdClass}>Pooled player, group wallet has credit, new charge arrives</td>
                  <td className={tdClass}>Auto-settled ✅</td>
                  <td className={tdClass}>None</td>
                </tr>
                <tr>
                  <td className={tdClass}>Pooled player, group has no credit, player has personal credit</td>
                  <td className={tdClass}>Outstanding ⚠️ (wallets are separate)</td>
                  <td className={tdClass}>Use <em>Pull member balances</em> on the group page</td>
                </tr>
                <tr>
                  <td className={tdClass}>Player overpays</td>
                  <td className={tdClass}>Credit stays for next charge ✅</td>
                  <td className={tdClass}>None</td>
                </tr>
                <tr>
                  <td className={tdClass}>Group member A pays for member B&apos;s charge</td>
                  <td className={tdClass}>Allowed — same group wallet ✅</td>
                  <td className={tdClass}>None</td>
                </tr>
              </tbody>
            </table>

            <h3 className={h3Class}>Dashboard vs individual page numbers</h3>
            <p className={pClass}>
              The dashboard <em>Outstanding collectible</em> stat sums both player
              and group wallet balances. The <em>Players who owe</em> box shows only
              individual player wallets — players whose debt sits in a group wallet
              are shown via the group credit/owe stat cards.
            </p>
          </Card>

          {/* ── Public Pages ── */}
          <Card className="p-6" id="public-pages">
            <h2 className={h2Class}>Public Pages</h2>
            <p className={pClass}>
              There are three public-facing pages that do not require a login:
            </p>

            <h3 className={h3Class}>Team board — <code className={codeClass}>/board/[token]</code></h3>
            <p className={pClass}>
              Shows all active players with their current balances. Each player row
              shows their <em>shared</em> (group) wallet balance and{" "}
              <em>personal</em> wallet balance separately. Tap a name to go to their
              private player page. Share this URL with the whole team — it is
              read-only.
            </p>

            <h3 className={h3Class}>Player portal — <code className={codeClass}>/p/[token]</code></h3>
            <p className={pClass}>
              Each player has a private URL showing their balance (shared wallet and
              personal wallet), upcoming games with RSVP, full charges &amp; payments
              history, and game attendance history. Share the individual link only
              with that player.
            </p>

            <h3 className={h3Class}>Group portal — <code className={codeClass}>/g/[token]</code></h3>
            <p className={pClass}>
              Shows the group&apos;s shared wallet balance, member list, all charges
              by member, all payments, and the full shared ledger.
            </p>

            <h3 className={h3Class}>Schedule — <code className={codeClass}>/schedule/[token]</code></h3>
            <p className={pClass}>
              Shows upcoming booked games with date, venue, and time. Accessible from
              the team board and player portals.
            </p>

            <h3 className={h3Class}>Regenerating tokens</h3>
            <p className={pClass}>
              If a link is accidentally shared publicly, regenerate the token on the
              player or group admin page. Old links will immediately stop working.
            </p>
          </Card>

          {/* ── FAQ ── */}
          <Card className="p-6" id="faq">
            <h2 className={h2Class}>FAQ</h2>

            <div className="space-y-5">
              {[
                {
                  q: "A player's balance shows ₱0 but they have an outstanding court share — why?",
                  a: "The player is likely in a pooled group. Their charges route to the group wallet. Check the group page (Groups / Funds) for the outstanding balance.",
                },
                {
                  q: "The dashboard expense outstanding is different from the expense detail page.",
                  a: "Both use the same FIFO wallet-based calculation. If there is a difference, ensure the migration 0008 (booking_payment_totals_fix) has been run in Supabase.",
                },
                {
                  q: "I reversed a payment but the outstanding balance didn't change.",
                  a: "Run migration 0008 to fix the booking_payment_totals view so reversed payments are excluded from totals.",
                },
                {
                  q: "I regenerated shares on a booking but old payment allocations look wrong.",
                  a: "Regenerating voids and replaces share ledger entries. Payments already made remain and FIFO re-applies them to the new shares from oldest to newest.",
                },
                {
                  q: "How do I record a group / couple paying together?",
                  a: "If both players are in a group, select the group as the payer when recording a payment. The payment credits the shared group wallet. Alternatively, record separate payments per individual.",
                },
                {
                  q: "A player overpaid. What happens to the extra money?",
                  a: "It stays as a credit in their wallet (or group wallet if pooled). FIFO will automatically apply it to their next charge. You can see it as a negative balance on the Collections page.",
                },
                {
                  q: "Can I undo a balance transfer?",
                  a: "There is no single undo button. To reverse a transfer, create another balance transfer in the opposite direction (from target back to source) for the same amount. Both ledger entries will cancel out.",
                },
                {
                  q: "How do I add a player to a group?",
                  a: "On the player's admin page, scroll to the 'Pooled funds / groups' card and select a group from the dropdown. Alternatively, on the group admin page, use the 'Add member' form.",
                },
                {
                  q: "The CSV export shows wrong balances for couples.",
                  a: "The CSV export lists every player and group separately. For couples in a group, the group's balance is the correct shared balance — the individual rows may show near-zero since charges route to the group.",
                },
              ].map(({ q, a }, i) => (
                <div key={i}>
                  <p className="font-semibold text-slate-800 text-sm">{q}</p>
                  <p className={`mt-1 ${pClass}`}>{a}</p>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
