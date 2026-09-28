-- Hosts who should start as Going on every new booking.
-- Also promote the logins already linked to Lester and Donna Tarranza.

alter table players
  add column if not exists auto_rsvp_going boolean not null default false;

create index if not exists players_auto_rsvp_going_idx
  on players (id)
  where auto_rsvp_going;

update players
set auto_rsvp_going = true
where lower(trim(name)) in ('lester', 'lester tarranza', 'donna tarranza');

update user_profiles
set role = 'admin'
where player_id in (
  select id
  from players
  where lower(trim(name)) in ('lester', 'lester tarranza', 'donna tarranza')
);
