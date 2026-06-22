# 🏓 Dinkering Pickleball Team Manager

A ledger-based web app for a pickleball team admin to manage court bookings,
attendance, payments, advance credits, pooled family/couple funds, and shared
team expenses (like pickleballs). Built with **Next.js + Supabase + Tailwind**,
mobile-first, with public read-only portals for players and groups.

---

## Accounting model (ledger-based)

Every **player** and **group/pooled fund** has a wallet. Balances are derived
**only** from the `ledger_entries` table:

```
balance = SUM(debit_amount) − SUM(credit_amount)   (ignoring voided entries)
```

| Meaning             | Sign        |
| ------------------- | ----------- |
| Owes money          | balance > 0 |
| Has credit          | balance < 0 |
| Settled             | balance = 0 |

Ledger sources:

| `source_type`          | Debit (charge) | Credit |
| ---------------------- | -------------- | ------ |
| `booking_share`        | court share    | —      |
| `team_expense_share`   | item share     | —      |
| `payment`              | —              | amount paid |
| `team_expense_credit`  | —              | full amount the buyer paid |
| `manual_adjustment`    | charge         | credit |

- **Advance / overpayments** naturally remain as a negative balance (credit)
  that offsets future charges — no special handling needed.
- **Pooled funds**: when a player belongs to an active `couple` / `family` /
  `team_fund` group, their charges and payments are routed to the **group**
  wallet so couples/families settle as one.
- **Financial safety**: charges and payments are never silently overwritten.
  Reversing a payment, regenerating shares, or reversing an expense **voids**
  the old ledger entries (kept for audit) and posts fresh ones. Records with
  financial history are archived/cancelled rather than hard-deleted.

---

## Tech stack

- **Next.js 16** (App Router, Server Components & Server Actions)
- **Supabase** (Postgres + Auth)
- **Tailwind CSS v4**
- **xlsx** for the Google Sheets / Excel importer
- Admin auth via Supabase Auth; players use **secure random share tokens**
  (no registration required).

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

At [supabase.com](https://supabase.com), create a project. Then in the SQL
editor, run the migration and (optionally) the demo seed:

- `supabase/migrations/0001_init.sql`  ← schema, views, RLS
- `supabase/seed.sql`                   ← optional demo data

### 3. Configure environment

Copy `.env.example` to `.env.local` and fill in your project values
(Project Settings → API):

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # server-only, never exposed to the browser
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Create an admin user

In Supabase → **Authentication → Users → Add user**, create an email/password
admin. (Disable public sign-ups; this app intentionally has no signup screen.)

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000> → **Admin sign in**.

---

## How it works

### Admin (`/admin`, login required)

- **Dashboard** — outstanding collectible, credits, booking costs, payments,
  upcoming & unpaid bookings, who owes / who has credit, recent activity.
- **Players** — add/edit, activate/deactivate/archive, public link, group
  assignment, per-player ledger, manual adjustments (with required reason).
- **Groups / Pooled Funds** — couples/families/team funds sharing one wallet.
- **Bookings** — live cost calc (courts × hours × rate + fees), status,
  roster & RSVP, confirm actual attendance, **generate booking shares** by
  share units with per-player overrides and wallet-credit visibility.
- **Payments** — by player or group, optional booking link; overpayments stay
  as credit; audit-safe reversal.
- **Team Expenses** — split by all active players / selected players /
  attendees / custom units; buyer is credited the full amount; shows
  assigned vs. unassigned.
- **Import** — upload your Google Sheet (`.xlsx`) and recreate ledger entries.

### Player portal (`/p/<token>`, public, read-only)

Current balance ("You owe ₱X" / "You have ₱X credit"), upcoming games with
**Going / Maybe / Not going** RSVP buttons, court shares, expense shares,
payments, appearance history, and the full ledger with a plain-English
explanation of the balance.

### Group portal (`/g/<token>`, public, read-only)

Shared balance, members, charges by member, payments by member, shared ledger.

> Player/group pages are public but protected by long random tokens. Regenerate
> a token anytime to revoke an old link.

---

## Importing from Google Sheets

1. In Google Sheets: **File → Download → Microsoft Excel (.xlsx)**.
2. Admin → **Import**, choose the file.
3. The importer matches tabs by name (Players, Bookings, Player Shares,
   Payments, Team Expenses, Expense Shares) and columns by common header names
   (case-insensitive). Booking Summary / Dashboard tabs are ignored — those are
   recalculated.
4. Tick **Wipe existing data** for a clean first import, then **Import**.
5. Compare the dashboard totals against your spreadsheet.

---

## Build roadmap

- **Phase 1 ✅** — schema, admin login, players, bookings, attendance/RSVP,
  booking shares, payments, ledger, player portal, dashboard.
- **Phase 2 ✅** — pooled funds/groups, team expenses & splitting, XLSX import,
  detailed player/group ledger pages.
- **Phase 3 (next)** — richer reports, payment reminders, CSV/XLSX export, QR
  codes for share links, optional member login, GCash/reference tracking.

---

## Project structure

```
src/
  app/
    admin/            # protected admin screens + server actions
    p/[token]/        # public player portal + RSVP action
    g/[token]/        # public group portal
    api/import/       # XLSX import endpoint (auth-checked)
    login/            # admin sign-in
  components/         # UI primitives, ledger table, nav
  lib/
    supabase/         # server / browser / service-role clients
    ledger.ts         # code generation, wallet routing, split math, posting
    format.ts         # ₱ currency, dates, balance descriptions
    types.ts          # database types
supabase/
  migrations/0001_init.sql
  seed.sql
```
