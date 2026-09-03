-- Per-player / per-booking history of admin actions (status changes,
-- adjustments, transfers) for transparency and dispute resolution.

create table if not exists admin_activity (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  actor_email  text,
  entity_type  text not null
                 check (entity_type in ('player','booking','payment','expense','group')),
  entity_id    uuid,
  action       text not null,
  details      text
);

create index if not exists admin_activity_entity_idx
  on admin_activity (entity_type, entity_id, created_at desc);

alter table admin_activity enable row level security;
create policy "admin_all_admin_activity" on admin_activity
  for all to authenticated using (true) with check (true);
