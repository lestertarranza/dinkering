-- Who invited each player. Founding members are marked instead of naming
-- an inviter. Existing rows stay unset until an admin fills them in.

alter table players
  add column if not exists is_founding_member boolean not null default false,
  add column if not exists invited_by_player_id uuid references players(id) on delete set null;

alter table players drop constraint if exists players_invite_xor;
alter table players
  add constraint players_invite_xor
  check (not (is_founding_member and invited_by_player_id is not null));

alter table players drop constraint if exists players_invite_not_self;
alter table players
  add constraint players_invite_not_self
  check (invited_by_player_id is null or invited_by_player_id <> id);

create index if not exists players_invited_by_idx
  on players (invited_by_player_id)
  where invited_by_player_id is not null;

alter table account_requests
  add column if not exists is_founding_member boolean not null default false,
  add column if not exists invited_by_player_id uuid references players(id) on delete set null;

alter table account_requests drop constraint if exists account_requests_invite_xor;
alter table account_requests
  add constraint account_requests_invite_xor
  check (not (is_founding_member and invited_by_player_id is not null));
