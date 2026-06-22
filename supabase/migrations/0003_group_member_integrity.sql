-- Group membership integrity:
--   * a player can be an active member of a group only once
--   * a group has at most one active "primary" member
-- First clean up any existing duplicates/extra primaries, then enforce.

-- 1) Close duplicate active memberships, keeping the earliest per (group, player).
with ranked as (
  select id,
         row_number() over (
           partition by player_group_id, player_id
           order by created_at
         ) as rn
  from player_group_members
  where end_date is null
)
update player_group_members m
set end_date = current_date
from ranked r
where m.id = r.id and r.rn > 1;

-- 2) Keep only the earliest primary per group; demote the rest.
with prim as (
  select id,
         row_number() over (
           partition by player_group_id
           order by created_at
         ) as rn
  from player_group_members
  where end_date is null and is_primary = true
)
update player_group_members m
set is_primary = false
from prim p
where m.id = p.id and p.rn > 1;

-- 3) Enforce: one active membership per (group, player).
create unique index if not exists uq_active_group_member
  on player_group_members (player_group_id, player_id)
  where end_date is null;

-- 4) Enforce: at most one active primary per group.
create unique index if not exists uq_one_primary_per_group
  on player_group_members (player_group_id)
  where end_date is null and is_primary = true;
