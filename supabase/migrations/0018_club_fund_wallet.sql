-- Wire club item pots to player wallets:
-- game contributions charge Going/attended players and add to a pot;
-- purchases credit the buyer and may overdraw the pot.

alter table club_fund_entries
  add column if not exists paid_by_player_id uuid references players(id) on delete set null,
  add column if not exists paid_by_group_id uuid references player_groups(id) on delete set null,
  add column if not exists booking_id uuid references bookings(id) on delete set null;

create index if not exists idx_club_fund_entries_booking
  on club_fund_entries (booking_id)
  where booking_id is not null;

create table if not exists club_fund_shares (
  id            uuid primary key default gen_random_uuid(),
  fund_entry_id uuid not null references club_fund_entries(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  amount_owed   numeric(12,2) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_club_fund_shares_entry on club_fund_shares(fund_entry_id);
create index if not exists idx_club_fund_shares_player on club_fund_shares(player_id);

alter table club_fund_shares enable row level security;
create policy "admin_all_club_fund_shares" on club_fund_shares
  for all to authenticated using (true) with check (true);

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'ledger_entries'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%source_type%'
  loop
    execute format('alter table ledger_entries drop constraint %I', r.conname);
  end loop;
end $$;

alter table ledger_entries add constraint ledger_entries_source_type_check
  check (source_type in (
    'booking_share',
    'payment',
    'team_expense_share',
    'team_expense_credit',
    'manual_adjustment',
    'club_fund_share',
    'club_fund_credit'
  ));
