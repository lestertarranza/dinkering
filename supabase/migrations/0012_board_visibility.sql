-- Let admins hide individual players or whole groups from the public
-- Team Balances board without touching their active status or ledger history.
alter table players
  add column if not exists hidden_on_board boolean not null default false;

alter table player_groups
  add column if not exists hidden_on_board boolean not null default false;
