-- Player-submitted payment screenshots (admin still records the payment).
create table if not exists payment_proofs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  player_group_id uuid references player_groups(id) on delete set null,
  amount numeric(12,2),
  reference_number text,
  image_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists payment_proofs_status_idx
  on payment_proofs (status, created_at desc);

alter table payment_proofs enable row level security;
create policy "admin_all_payment_proofs" on payment_proofs
  for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  true,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
on conflict (id) do nothing;

-- Last time admin copied / marked a collections reminder as sent.
create table if not exists collection_contacts (
  owner_kind text not null check (owner_kind in ('player', 'group')),
  owner_id uuid not null,
  contacted_at timestamptz not null default now(),
  notes text,
  primary key (owner_kind, owner_id)
);

alter table collection_contacts enable row level security;
create policy "admin_all_collection_contacts" on collection_contacts
  for all to authenticated using (true) with check (true);
