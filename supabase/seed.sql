-- Optional demo data for Dinkering Pickleball Team Manager.
-- Run AFTER 0001_init.sql. Safe to skip in production.
-- Demonstrates pooled funds, booking shares, a payment, and a team expense.

do $$
declare
  p_pachie uuid; p_carl uuid; p_cas uuid; p_bien uuid;
  g_couple uuid;
  bk uuid;
  exp uuid;
  s uuid;
  pay uuid;
begin
  insert into players (name, display_name) values ('Pachie','Pachie') returning id into p_pachie;
  insert into players (name, display_name) values ('Carl','Carl') returning id into p_carl;
  insert into players (name, display_name) values ('Cas','Cas') returning id into p_cas;
  insert into players (name, display_name) values ('Bien','Bien') returning id into p_bien;

  insert into player_groups (name, type) values ('Pachie & Carl','couple') returning id into g_couple;
  insert into player_group_members (player_group_id, player_id, is_primary, start_date)
    values (g_couple, p_pachie, true, current_date),
           (g_couple, p_carl, false, current_date);

  -- Booking PB-001: 1 court x 2 hrs x 200 = 400, split 4 ways = 100 each
  insert into bookings (booking_code, play_date, start_time, end_time, venue,
    courts_booked, hours, rate_per_court_per_hour, other_fees, total_booking_cost, status)
  values ('PB-001', current_date - 7, '19:00', '21:00', 'City Pickle Courts',
    1, 2, 200, 0, 400, 'played')
  returning id into bk;

  -- Pachie & Carl shares route to the couple wallet; Cas & Bien to themselves
  insert into booking_shares (booking_id, player_id, player_group_id, share_units, amount_owed)
    values (bk, p_pachie, g_couple, 1, 100) returning id into s;
  insert into ledger_entries (entry_date, player_group_id, source_type, source_id, description, debit_amount)
    values (current_date - 7, g_couple, 'booking_share', s, 'Court share — PB-001', 100);

  insert into booking_shares (booking_id, player_id, player_group_id, share_units, amount_owed)
    values (bk, p_carl, g_couple, 1, 100) returning id into s;
  insert into ledger_entries (entry_date, player_group_id, source_type, source_id, description, debit_amount)
    values (current_date - 7, g_couple, 'booking_share', s, 'Court share — PB-001', 100);

  insert into booking_shares (booking_id, player_id, share_units, amount_owed)
    values (bk, p_cas, 1, 100) returning id into s;
  insert into ledger_entries (entry_date, player_id, source_type, source_id, description, debit_amount)
    values (current_date - 7, p_cas, 'booking_share', s, 'Court share — PB-001', 100);

  insert into booking_shares (booking_id, player_id, share_units, amount_owed)
    values (bk, p_bien, 1, 100) returning id into s;
  insert into ledger_entries (entry_date, player_id, source_type, source_id, description, debit_amount)
    values (current_date - 7, p_bien, 'booking_share', s, 'Court share — PB-001', 100);

  -- Bien pays 100 toward the booking
  insert into payments (payment_code, payment_date, payer_player_id, booking_id, amount, payment_method)
    values ('PAY-001', current_date - 6, p_bien, bk, 100, 'GCash') returning id into pay;
  insert into ledger_entries (entry_date, player_id, source_type, source_id, description, credit_amount)
    values (current_date - 6, p_bien, 'payment', pay, 'Payment PAY-001 (booking)', 100);

  -- Team expense EXP-001: 600 of balls bought by Cas, split 4 ways = 150 each
  insert into team_expenses (expense_code, purchase_date, description, paid_by_player_id, total_cost, split_method)
    values ('EXP-001', current_date - 3, '6 tubes of pickleballs', p_cas, 600, 'active_players')
  returning id into exp;
  -- Buyer credit to Cas
  insert into ledger_entries (entry_date, player_id, source_type, source_id, description, credit_amount)
    values (current_date - 3, p_cas, 'team_expense_credit', exp, 'Reimbursement — EXP-001', 600);

  insert into team_expense_shares (team_expense_id, player_id, player_group_id, share_units, amount_owed)
    values (exp, p_pachie, g_couple, 1, 150) returning id into s;
  insert into ledger_entries (entry_date, player_group_id, source_type, source_id, description, debit_amount)
    values (current_date - 3, g_couple, 'team_expense_share', s, 'Expense share — EXP-001', 150);

  insert into team_expense_shares (team_expense_id, player_id, player_group_id, share_units, amount_owed)
    values (exp, p_carl, g_couple, 1, 150) returning id into s;
  insert into ledger_entries (entry_date, player_group_id, source_type, source_id, description, debit_amount)
    values (current_date - 3, g_couple, 'team_expense_share', s, 'Expense share — EXP-001', 150);

  insert into team_expense_shares (team_expense_id, player_id, share_units, amount_owed)
    values (exp, p_cas, 1, 150) returning id into s;
  insert into ledger_entries (entry_date, player_id, source_type, source_id, description, debit_amount)
    values (current_date - 3, p_cas, 'team_expense_share', s, 'Expense share — EXP-001', 150);

  insert into team_expense_shares (team_expense_id, player_id, share_units, amount_owed)
    values (exp, p_bien, 1, 150) returning id into s;
  insert into ledger_entries (entry_date, player_id, source_type, source_id, description, debit_amount)
    values (current_date - 3, p_bien, 'team_expense_share', s, 'Expense share — EXP-001', 150);

  -- Upcoming booking PB-002 for RSVP demo
  insert into bookings (booking_code, play_date, start_time, end_time, venue,
    courts_booked, hours, rate_per_court_per_hour, other_fees, total_booking_cost, status)
  values ('PB-002', current_date + 5, '19:00', '21:00', 'City Pickle Courts',
    1, 2, 200, 0, 400, 'booked')
  returning id into bk;
  insert into booking_attendance (booking_id, player_id, response_status)
    values (bk, p_pachie, 'going'), (bk, p_carl, 'maybe'),
           (bk, p_cas, 'going'), (bk, p_bien, 'no_response');
end $$;
