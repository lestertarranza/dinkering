-- Dinkering Pickleball Team Manager — initial schema
-- Ledger-based accounting model.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Helper: generate a long, URL-safe random share token
create or replace function gen_share_token()
returns text
language sql
as $$
  select encode(gen_random_bytes(24), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------
create table players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  display_name  text,
  active_status text not null default 'active'
                  check (active_status in ('active','inactive','archived')),
  notes         text,
  public_token  text not null unique default gen_share_token(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_players_updated before update on players
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Player groups / pooled funds
-- ---------------------------------------------------------------------------
create table player_groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text not null default 'couple'
                 check (type in ('individual','couple','family','team_fund')),
  notes        text,
  public_token text not null unique default gen_share_token(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_player_groups_updated before update on player_groups
  for each row execute function set_updated_at();

create table player_group_members (
  id              uuid primary key default gen_random_uuid(),
  player_group_id uuid not null references player_groups(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  start_date      date,
  end_date        date,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_pgm_group on player_group_members(player_group_id);
create index idx_pgm_player on player_group_members(player_id);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table bookings (
  id                       uuid primary key default gen_random_uuid(),
  booking_code             text unique,
  play_date                date not null,
  start_time               time,
  end_time                 time,
  venue                    text,
  courts_booked            numeric(6,2) not null default 1,
  hours                    numeric(6,2) not null default 1,
  rate_per_court_per_hour  numeric(12,2) not null default 0,
  other_fees               numeric(12,2) not null default 0,
  total_booking_cost       numeric(12,2) not null default 0,
  status                   text not null default 'booked'
                             check (status in ('booked','played','cancelled','refunded')),
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Booking attendance / RSVP
-- ---------------------------------------------------------------------------
create table booking_attendance (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings(id) on delete cascade,
  player_id         uuid not null references players(id) on delete cascade,
  response_status   text not null default 'no_response'
                      check (response_status in ('going','maybe','not_going','no_response')),
  actual_status     text
                      check (actual_status in ('attended','absent','late_cancel','guest')),
  confirmed_by_admin boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (booking_id, player_id)
);
create trigger trg_attendance_updated before update on booking_attendance
  for each row execute function set_updated_at();
create index idx_attendance_booking on booking_attendance(booking_id);

-- ---------------------------------------------------------------------------
-- Booking shares (charges)
-- ---------------------------------------------------------------------------
create table booking_shares (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references bookings(id) on delete cascade,
  player_id             uuid references players(id) on delete cascade,
  player_group_id       uuid references player_groups(id) on delete cascade,
  share_units           numeric(6,2) not null default 1,
  override_share_amount numeric(12,2),
  amount_owed           numeric(12,2) not null default 0,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_booking_shares_updated before update on booking_shares
  for each row execute function set_updated_at();
create index idx_booking_shares_booking on booking_shares(booking_id);

-- ---------------------------------------------------------------------------
-- Payments (credits)
-- ---------------------------------------------------------------------------
create table payments (
  id              uuid primary key default gen_random_uuid(),
  payment_code    text unique,
  payment_date    date not null default current_date,
  payer_player_id uuid references players(id) on delete set null,
  payer_group_id  uuid references player_groups(id) on delete set null,
  booking_id      uuid references bookings(id) on delete set null,
  amount          numeric(12,2) not null,
  payment_method  text,
  reference_number text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_payments_updated before update on payments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Team expenses
-- ---------------------------------------------------------------------------
create table team_expenses (
  id                uuid primary key default gen_random_uuid(),
  expense_code      text unique,
  purchase_date     date not null default current_date,
  description       text not null,
  paid_by_player_id uuid references players(id) on delete set null,
  paid_by_group_id  uuid references player_groups(id) on delete set null,
  total_cost        numeric(12,2) not null default 0,
  split_method      text not null default 'active_players'
                      check (split_method in ('active_players','selected_players','attendees','custom')),
  status            text not null default 'open',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_team_expenses_updated before update on team_expenses
  for each row execute function set_updated_at();

create table team_expense_shares (
  id                    uuid primary key default gen_random_uuid(),
  team_expense_id       uuid not null references team_expenses(id) on delete cascade,
  player_id             uuid references players(id) on delete cascade,
  player_group_id       uuid references player_groups(id) on delete cascade,
  share_units           numeric(6,2) not null default 1,
  override_share_amount numeric(12,2),
  amount_owed           numeric(12,2) not null default 0,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_expense_shares_expense on team_expense_shares(team_expense_id);

-- ---------------------------------------------------------------------------
-- Ledger entries (source of truth for balances)
-- ---------------------------------------------------------------------------
create table ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  entry_date      date not null default current_date,
  player_id       uuid references players(id) on delete cascade,
  player_group_id uuid references player_groups(id) on delete cascade,
  source_type     text not null
                    check (source_type in (
                      'booking_share','payment','team_expense_share',
                      'team_expense_credit','manual_adjustment')),
  source_id       uuid,
  description     text,
  debit_amount    numeric(12,2) not null default 0,
  credit_amount   numeric(12,2) not null default 0,
  voided          boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_ledger_player on ledger_entries(player_id);
create index idx_ledger_group on ledger_entries(player_group_id);
create index idx_ledger_source on ledger_entries(source_type, source_id);

-- ---------------------------------------------------------------------------
-- Manual adjustments
-- ---------------------------------------------------------------------------
create table manual_adjustments (
  id              uuid primary key default gen_random_uuid(),
  adjustment_date date not null default current_date,
  player_id       uuid references players(id) on delete cascade,
  player_group_id uuid references player_groups(id) on delete cascade,
  amount          numeric(12,2) not null,
  type            text not null check (type in ('charge','credit')),
  reason          text not null,
  created_by      text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Balance views (debit - credit, ignoring voided entries)
-- ---------------------------------------------------------------------------
create view player_balances as
select
  p.id as player_id,
  coalesce(sum(le.debit_amount) filter (where not le.voided), 0) as total_debit,
  coalesce(sum(le.credit_amount) filter (where not le.voided), 0) as total_credit,
  coalesce(sum(le.debit_amount - le.credit_amount) filter (where not le.voided), 0) as balance
from players p
left join ledger_entries le on le.player_id = p.id
group by p.id;

create view group_balances as
select
  g.id as player_group_id,
  coalesce(sum(le.debit_amount) filter (where not le.voided), 0) as total_debit,
  coalesce(sum(le.credit_amount) filter (where not le.voided), 0) as total_credit,
  coalesce(sum(le.debit_amount - le.credit_amount) filter (where not le.voided), 0) as balance
from player_groups g
left join ledger_entries le on le.player_group_id = g.id
group by g.id;

-- Per-booking paid totals (payments tagged to a booking)
create view booking_payment_totals as
select
  b.id as booking_id,
  coalesce(sum(pay.amount), 0) as total_paid
from bookings b
left join payments pay on pay.booking_id = b.id
group by b.id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- App is admin-only for writes; authenticated users (admins) get full access.
-- Public portals are served through the service role on the server, validated
-- by share token, so anon never needs direct table access.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'players','player_groups','player_group_members','bookings',
    'booking_attendance','booking_shares','payments','team_expenses',
    'team_expense_shares','ledger_entries','manual_adjustments'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format($f$
      create policy "admin_all_%1$s" on %1$I
        for all to authenticated using (true) with check (true);
    $f$, t);
  end loop;
end $$;
