-- Seat holds for Going and the waitlist, plus the invite columns if
-- 0021 has not been applied yet. Also snapshots current RSVP on upcoming
-- games into Previous RSVP, then clears the live answer so players respond
-- again under the hold.

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

alter table bookings
  add column if not exists hold_fee numeric(12,2);

update bookings
set hold_fee = 200
where hold_fee is null;

alter table bookings
  alter column hold_fee set default 200;

alter table bookings
  alter column hold_fee set not null;

alter table bookings drop constraint if exists bookings_hold_fee_min;
alter table bookings
  add constraint bookings_hold_fee_min check (hold_fee >= 200);

alter table booking_attendance
  add column if not exists previous_response_status text,
  add column if not exists previous_waitlisted_at timestamptz,
  add column if not exists hold_waived boolean not null default false;

create table if not exists seat_holds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  player_group_id uuid references player_groups(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null check (status in ('open', 'applied', 'returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, player_id)
);

create index if not exists seat_holds_open_idx
  on seat_holds (booking_id)
  where status = 'open';

alter table seat_holds enable row level security;
drop policy if exists "admin_all_seat_holds" on seat_holds;
create policy "admin_all_seat_holds" on seat_holds
  for all to authenticated using (true) with check (true);

-- One-time snapshot. Later runs do not wipe a Previous RSVP that already exists.
update booking_attendance a
set
  previous_response_status = a.response_status,
  previous_waitlisted_at = a.waitlisted_at,
  response_status = 'no_response',
  waitlisted_at = null
from bookings b
where a.booking_id = b.id
  and b.play_date >= current_date
  and b.status in ('for_booking', 'booked')
  and a.response_status <> 'no_response'
  and a.previous_response_status is null;
