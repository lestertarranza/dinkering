-- Add screenshot URL to payments (stores the Supabase Storage public URL).
alter table payments
  add column if not exists screenshot_url text;

-- Create a public storage bucket for payment confirmation screenshots.
-- Service-role uploads bypass RLS; public bucket means URLs are directly readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-screenshots',
  'payment-screenshots',
  true,
  10485760,   -- 10 MB max per file
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
on conflict (id) do nothing;
