-- Recreate booking_payment_totals to exclude reversed payments.
-- A reversed payment prepends "[REVERSED ...]" to the notes field; those rows
-- should not count as "paid" since their ledger credit has been voided.
create or replace view booking_payment_totals as
select
  b.id as booking_id,
  coalesce(
    sum(pay.amount) filter (
      where pay.notes is null or pay.notes not ilike '[REVERSED%'
    ),
    0
  ) as total_paid
from bookings b
left join payments pay on pay.booking_id = b.id
group by b.id;
