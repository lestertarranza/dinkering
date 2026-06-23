-- Link payments to team expenses for bulk settlement history.
alter table payments
  add column if not exists team_expense_id uuid references team_expenses(id) on delete set null;

create index if not exists idx_payments_team_expense on payments(team_expense_id);
