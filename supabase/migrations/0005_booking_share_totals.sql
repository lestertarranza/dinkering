-- Per-booking total of charged player shares. Used so that "amount due /
-- outstanding" everywhere is computed from what players were actually charged
-- (the ledger basis), keeping it consistent with player/group balances rather
-- than from the raw court cost (which can differ by a few centavos after
-- splitting fractional shares).
create or replace view booking_share_totals as
select
  b.id as booking_id,
  coalesce(sum(s.amount_owed), 0) as total_shared
from bookings b
left join booking_shares s on s.booking_id = b.id
group by b.id;
