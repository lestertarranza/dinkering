-- Single-row table for app-wide settings, including the public "team board"
-- token used to gate the read-only roster page.
create table if not exists app_settings (
  id            boolean primary key default true check (id),
  roster_token  text not null unique default gen_share_token(),
  roster_public boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- Guarantee exactly one row exists.
insert into app_settings (id) values (true) on conflict (id) do nothing;

create trigger trg_app_settings_updated before update on app_settings
  for each row execute function set_updated_at();

-- Admins (authenticated) get full access; the public roster is read through
-- the service role on the server after validating the token.
alter table app_settings enable row level security;
create policy "admin_all_app_settings" on app_settings
  for all to authenticated using (true) with check (true);
