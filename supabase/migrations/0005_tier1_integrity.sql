-- Wallet ownership constraints + atomic share rebuild RPCs + GCash setting.

-- ---------------------------------------------------------------------------
-- GCash number for payment reminders (admin-configurable)
-- ---------------------------------------------------------------------------
alter table app_settings
  add column if not exists gcash_number text;

-- ---------------------------------------------------------------------------
-- Exactly one wallet owner on ledger rows and payments
-- ---------------------------------------------------------------------------
alter table ledger_entries
  drop constraint if exists ledger_exactly_one_wallet;

alter table ledger_entries
  add constraint ledger_exactly_one_wallet check (
    (player_id is not null and player_group_id is null)
    or (player_id is null and player_group_id is not null)
  );

alter table payments
  drop constraint if exists payment_exactly_one_payer;

alter table payments
  add constraint payment_exactly_one_payer check (
    (payer_player_id is not null and payer_group_id is null)
    or (payer_player_id is null and payer_group_id is not null)
  );

-- ---------------------------------------------------------------------------
-- Atomic booking share rebuild (void + delete + insert in one transaction)
-- p_rows: [{ "player_id", "share_units", "override_share_amount", "amount_owed",
--            "ledger_player_id", "ledger_group_id" }, ...]
-- ---------------------------------------------------------------------------
create or replace function rebuild_booking_shares_atomic(
  p_booking_id uuid,
  p_play_date date,
  p_booking_code text,
  p_rows jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_share_id uuid;
  v_code text;
begin
  update ledger_entries
  set voided = true
  where source_type = 'booking_share'
    and voided = false
    and source_id in (
      select id from booking_shares where booking_id = p_booking_id
    );

  delete from booking_shares where booking_id = p_booking_id;

  if p_rows is null or jsonb_array_length(p_rows) = 0 then
    return;
  end if;

  v_code := coalesce(p_booking_code, 'booking');

  for r in select * from jsonb_array_elements(p_rows)
  loop
    insert into booking_shares (
      booking_id,
      player_id,
      player_group_id,
      share_units,
      override_share_amount,
      amount_owed
    ) values (
      p_booking_id,
      (r->>'player_id')::uuid,
      nullif(r->>'player_group_id', '')::uuid,
      coalesce((r->>'share_units')::numeric, 1),
      nullif(r->>'override_share_amount', '')::numeric,
      (r->>'amount_owed')::numeric
    )
    returning id into v_share_id;

    insert into ledger_entries (
      entry_date,
      player_id,
      player_group_id,
      source_type,
      source_id,
      description,
      debit_amount,
      credit_amount
    ) values (
      p_play_date,
      nullif(r->>'ledger_player_id', '')::uuid,
      nullif(r->>'ledger_group_id', '')::uuid,
      'booking_share',
      v_share_id,
      'Court share — ' || v_code,
      (r->>'amount_owed')::numeric,
      0
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic expense share rebuild
-- p_rows: same shape as booking; p_credit_* = buyer wallet for reimbursement
-- ---------------------------------------------------------------------------
create or replace function rebuild_expense_shares_atomic(
  p_expense_id uuid,
  p_purchase_date date,
  p_expense_label text,
  p_total_cost numeric,
  p_credit_player_id uuid,
  p_credit_group_id uuid,
  p_rows jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_share_id uuid;
  v_label text;
begin
  update ledger_entries
  set voided = true
  where source_type = 'team_expense_share'
    and voided = false
    and source_id in (
      select id from team_expense_shares where team_expense_id = p_expense_id
    );

  update ledger_entries
  set voided = true
  where source_type = 'team_expense_credit'
    and source_id = p_expense_id
    and voided = false;

  delete from team_expense_shares where team_expense_id = p_expense_id;

  v_label := coalesce(p_expense_label, 'expense');

  if p_credit_player_id is not null or p_credit_group_id is not null then
    insert into ledger_entries (
      entry_date,
      player_id,
      player_group_id,
      source_type,
      source_id,
      description,
      debit_amount,
      credit_amount
    ) values (
      p_purchase_date,
      p_credit_player_id,
      p_credit_group_id,
      'team_expense_credit',
      p_expense_id,
      'Reimbursement — ' || v_label,
      0,
      p_total_cost
    );
  end if;

  if p_rows is null or jsonb_array_length(p_rows) = 0 then
    return;
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    insert into team_expense_shares (
      team_expense_id,
      player_id,
      player_group_id,
      share_units,
      override_share_amount,
      amount_owed
    ) values (
      p_expense_id,
      (r->>'player_id')::uuid,
      nullif(r->>'player_group_id', '')::uuid,
      coalesce((r->>'share_units')::numeric, 1),
      nullif(r->>'override_share_amount', '')::numeric,
      (r->>'amount_owed')::numeric
    )
    returning id into v_share_id;

    insert into ledger_entries (
      entry_date,
      player_id,
      player_group_id,
      source_type,
      source_id,
      description,
      debit_amount,
      credit_amount
    ) values (
      p_purchase_date,
      nullif(r->>'ledger_player_id', '')::uuid,
      nullif(r->>'ledger_group_id', '')::uuid,
      'team_expense_share',
      v_share_id,
      'Expense share — ' || v_label,
      (r->>'amount_owed')::numeric,
      0
    );
  end loop;
end;
$$;

grant execute on function rebuild_booking_shares_atomic(uuid, date, text, jsonb)
  to authenticated, service_role;
grant execute on function rebuild_expense_shares_atomic(
  uuid, date, text, numeric, uuid, uuid, jsonb
) to authenticated, service_role;

-- Dashboard aggregate totals (avoids loading full ledger/booking tables)
create or replace view dashboard_totals as
select
  coalesce((
    select sum(credit_amount)
    from ledger_entries
    where source_type = 'payment' and not voided
  ), 0) as total_payments,
  coalesce((
    select sum(total_booking_cost)
    from bookings
    where status = 'played'
  ), 0) as played_booking_cost,
  coalesce((
    select sum(total_booking_cost)
    from bookings
    where status = 'booked'
  ), 0) as upcoming_commitments;
