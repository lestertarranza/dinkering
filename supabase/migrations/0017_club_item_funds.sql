-- Dedicated club pots for upcoming purchases (pickleballs, nets, etc.).
-- Separate from player_groups.team_fund (those are shared player wallets).
-- Balance is allocate minus spend; never stored as a mutable column.

create table if not exists club_item_funds (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  notes          text,
  target_amount  numeric(12,2),
  status         text not null default 'active'
                   check (status in ('active', 'archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_club_item_funds_updated before update on club_item_funds
  for each row execute function set_updated_at();

create table if not exists club_fund_entries (
  id              uuid primary key default gen_random_uuid(),
  fund_id         uuid not null references club_item_funds(id) on delete cascade,
  entry_date      date not null default current_date,
  kind            text not null check (kind in ('allocate', 'spend')),
  amount          numeric(12,2) not null check (amount > 0),
  description     text,
  notes           text,
  team_expense_id uuid references team_expenses(id) on delete set null,
  voided          boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists idx_club_fund_entries_fund
  on club_fund_entries (fund_id, entry_date desc, created_at desc);

create or replace view club_fund_balances as
select
  f.id as fund_id,
  coalesce(sum(e.amount) filter (where not e.voided and e.kind = 'allocate'), 0)
    - coalesce(sum(e.amount) filter (where not e.voided and e.kind = 'spend'), 0)
    as balance
from club_item_funds f
left join club_fund_entries e on e.fund_id = f.id
group by f.id;

alter table club_item_funds enable row level security;
create policy "admin_all_club_item_funds" on club_item_funds
  for all to authenticated using (true) with check (true);

alter table club_fund_entries enable row level security;
create policy "admin_all_club_fund_entries" on club_fund_entries
  for all to authenticated using (true) with check (true);
