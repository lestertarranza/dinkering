-- Link team expenses (balls, extras) to a court booking so they appear
-- on both the booking page and Team Expenses.
alter table team_expenses
  add column if not exists booking_id uuid references bookings(id) on delete set null;

create index if not exists idx_team_expenses_booking on team_expenses(booking_id);
