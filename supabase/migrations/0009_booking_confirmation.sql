-- Store the booking confirmation screenshot (court reservation receipt from venue)
-- on the booking record so it can be shown to players on public pages.
alter table bookings
  add column if not exists confirmation_url text;

-- Supabase Storage bucket for booking confirmation images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-confirmations',
  'booking-confirmations',
  true,
  10485760,   -- 10 MB max
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
on conflict (id) do nothing;
