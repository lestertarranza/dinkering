-- Support multiple booking confirmation screenshots per booking.
alter table bookings
  add column if not exists confirmation_urls text[] not null default '{}';

-- Migrate any existing single confirmation_url into the array.
update bookings
set confirmation_urls = array[confirmation_url]
where confirmation_url is not null
  and confirmation_url <> ''
  and (confirmation_urls is null or array_length(confirmation_urls, 1) is null);
