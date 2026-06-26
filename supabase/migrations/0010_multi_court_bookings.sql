-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-court bookings: each booking can have multiple courts,
-- a new "waitlist" RSVP status, and a new "for_booking" booking status.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New booking status -------------------------------------------------------
alter table bookings
  drop constraint if exists bookings_status_check;
alter table bookings
  add constraint bookings_status_check
    check (status in ('for_booking','booked','played','cancelled','refunded'));

-- 2. New RSVP status ----------------------------------------------------------
alter table booking_attendance
  drop constraint if exists booking_attendance_response_status_check;
alter table booking_attendance
  add constraint booking_attendance_response_status_check
    check (response_status in ('going','maybe','not_going','no_response','waitlist'));

-- 3. booking_courts table -----------------------------------------------------
create table if not exists booking_courts (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  court_number    text,
  start_time      time,
  end_time        time,
  hours           numeric(5,2) not null default 1 check (hours > 0),
  rate_per_court_per_hour numeric(10,2) not null default 0 check (rate_per_court_per_hour >= 0),
  max_players     int not null default 0 check (max_players >= 0),  -- 0 = unlimited
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_booking_courts_booking on booking_courts(booking_id);

create trigger trg_booking_courts_updated
  before update on booking_courts
  for each row execute function set_updated_at();

-- 4. Migrate existing booking data to booking_courts -------------------------
-- Creates one court row per booking using the existing single-court fields.
-- Bookings with courts_booked > 1 get N rows (one per court, same specs).
do $$
declare
  b record;
  i int;
  cn text;
begin
  for b in
    select id, court_number, start_time, end_time, hours,
           rate_per_court_per_hour, courts_booked
    from bookings
    where hours > 0 and rate_per_court_per_hour > 0
  loop
    for i in 1..greatest(coalesce(b.courts_booked,1),1) loop
      cn := case
              when b.courts_booked > 1
                   then coalesce(b.court_number, 'Court') || ' ' || i
              else b.court_number
            end;
      insert into booking_courts
        (booking_id, court_number, start_time, end_time, hours, rate_per_court_per_hour, max_players)
      values
        (b.id, cn, b.start_time, b.end_time, b.hours, b.rate_per_court_per_hour, 0);
    end loop;
  end loop;
end;
$$;

-- 5. Trigger: keep total_booking_cost in sync when courts change --------------
create or replace function sync_booking_total_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bid uuid;
  new_total numeric;
begin
  bid := coalesce(new.booking_id, old.booking_id);
  select coalesce(sum(hours * rate_per_court_per_hour), 0)
  into   new_total
  from   booking_courts
  where  booking_id = bid;
  -- Add other_fees from the booking
  update bookings
  set    total_booking_cost = new_total + coalesce(other_fees, 0)
  where  id = bid;
  return new;
end;
$$;

create trigger trg_booking_courts_sync_total
  after insert or update or delete on booking_courts
  for each row execute function sync_booking_total_cost();

-- Re-sync all existing bookings now that courts rows exist
update bookings b
set    total_booking_cost = (
         select coalesce(sum(bc.hours * bc.rate_per_court_per_hour), 0)
         from   booking_courts bc
         where  bc.booking_id = b.id
       ) + coalesce(b.other_fees, 0);

-- 6. Helper RPC for app-level resync after other_fees change ----------------
create or replace function sync_booking_total(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update bookings b
  set total_booking_cost = (
    select coalesce(sum(bc.hours * bc.rate_per_court_per_hour), 0)
    from booking_courts bc
    where bc.booking_id = b.id
  ) + coalesce(b.other_fees, 0)
  where b.id = p_booking_id;
end;
$$;

grant execute on function sync_booking_total(uuid) to authenticated, service_role;

-- 7. RLS on booking_courts (same pattern as other tables) --------------------
alter table booking_courts enable row level security;
create policy "admin_all_booking_courts" on booking_courts
  for all to authenticated using (true) with check (true);

-- Grant to service_role for portal reads
grant select on booking_courts to service_role;
