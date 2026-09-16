-- Player registration / claim, admin roles, and lock down authenticated access.
-- Until this runs, new sign-up code will fail. Existing admins in auth.users
-- are seeded as role=admin so they keep the admin app.
--
-- Tables must exist before is_admin() — CREATE FUNCTION LANGUAGE sql
-- resolves relations at create time.

create table if not exists user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'player')),
  player_id   uuid unique references players(id) on delete set null,
  first_name  text not null default '',
  last_name   text not null default '',
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_user_profiles_updated on user_profiles;
create trigger trg_user_profiles_updated before update on user_profiles
  for each row execute function set_updated_at();
create unique index if not exists user_profiles_phone_key
  on user_profiles (phone)
  where phone is not null;
create index if not exists user_profiles_player_idx
  on user_profiles (player_id)
  where player_id is not null;

create table if not exists account_requests (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('register', 'claim')),
  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  auth_user_id       uuid not null references auth.users(id) on delete cascade,
  email              text not null,
  phone              text not null,
  first_name         text not null,
  last_name          text not null,
  avatar_url         text,
  claimed_player_id  uuid references players(id) on delete set null,
  note               text,
  reject_reason      text,
  reviewed_by        uuid references auth.users(id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (
    (kind = 'register' and claimed_player_id is null)
    or (kind = 'claim' and claimed_player_id is not null)
  )
);
drop trigger if exists trg_account_requests_updated on account_requests;
create trigger trg_account_requests_updated before update on account_requests
  for each row execute function set_updated_at();
create index if not exists account_requests_status_idx
  on account_requests (status, created_at desc);
create unique index if not exists account_requests_one_pending_user
  on account_requests (auth_user_id)
  where status = 'pending';
create unique index if not exists account_requests_one_pending_phone
  on account_requests (phone)
  where status = 'pending';
create unique index if not exists account_requests_one_pending_claim
  on account_requests (claimed_player_id)
  where status = 'pending' and claimed_player_id is not null;

insert into user_profiles (id, role, first_name, last_name)
select
  u.id,
  'admin',
  coalesce(nullif(split_part(u.email, '@', 1), ''), 'Admin'),
  ''
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- New Auth users are players, never admins. Must run after the admin seed.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, role, first_name, last_name)
  values (
    new.id,
    'player',
    coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'last_name'), ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table user_profiles enable row level security;
alter table account_requests enable row level security;

grant select, insert, update, delete on user_profiles to authenticated;
grant select, insert, update, delete on account_requests to authenticated;

drop policy if exists "admin_all_user_profiles" on user_profiles;
create policy "admin_all_user_profiles" on user_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "own_user_profile_select" on user_profiles;
create policy "own_user_profile_select" on user_profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "admin_all_account_requests" on account_requests;
create policy "admin_all_account_requests" on account_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "own_account_requests_select" on account_requests;
create policy "own_account_requests_select" on account_requests
  for select to authenticated using (auth_user_id = auth.uid());

do $$
declare pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'admin_all_%'
      and tablename not in ('user_profiles', 'account_requests')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      pol.policyname, pol.schemaname, pol.tablename
    );
    execute format(
      'create policy %I on %I.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      pol.policyname, pol.schemaname, pol.tablename
    );
  end loop;
end $$;

alter view player_balances set (security_invoker = true);
alter view group_balances set (security_invoker = true);
alter view booking_payment_totals set (security_invoker = true);
alter view dashboard_totals set (security_invoker = true);
alter view club_fund_balances set (security_invoker = true);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_own_write" on storage.objects;
create policy "avatars_own_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_admin_all" on storage.objects;
create policy "avatars_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());
