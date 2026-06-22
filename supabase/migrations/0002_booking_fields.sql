-- Add court number and external booking reference to bookings.
alter table bookings
  add column if not exists court_number text,
  add column if not exists booking_reference text;
