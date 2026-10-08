-- Let a pooled group opt in so members can RSVP for one another.
-- Default off. The hold still comes from the shared wallet.

alter table player_groups
  add column if not exists members_can_rsvp boolean not null default false;
