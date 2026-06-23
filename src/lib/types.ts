export type ActiveStatus = "active" | "inactive" | "archived";
export type GroupType = "individual" | "couple" | "family" | "team_fund";
export type BookingStatus = "booked" | "played" | "cancelled" | "refunded";
export type ResponseStatus = "going" | "maybe" | "not_going" | "no_response";
export type ActualStatus = "attended" | "absent" | "late_cancel" | "guest";
export type SplitMethod =
  | "active_players"
  | "selected_players"
  | "attendees"
  | "custom";
export type SourceType =
  | "booking_share"
  | "payment"
  | "team_expense_share"
  | "team_expense_credit"
  | "manual_adjustment";
export type AdjustmentType = "charge" | "credit";

export interface Player {
  id: string;
  name: string;
  display_name: string | null;
  active_status: ActiveStatus;
  notes: string | null;
  public_token: string;
  created_at: string;
  updated_at: string;
}

export interface PlayerGroup {
  id: string;
  name: string;
  type: GroupType;
  notes: string | null;
  public_token: string;
  created_at: string;
  updated_at: string;
}

export interface PlayerGroupMember {
  id: string;
  player_group_id: string;
  player_id: string;
  start_date: string | null;
  end_date: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  booking_code: string | null;
  play_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  court_number: string | null;
  booking_reference: string | null;
  courts_booked: number;
  hours: number;
  rate_per_court_per_hour: number;
  other_fees: number;
  total_booking_cost: number;
  status: BookingStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingAttendance {
  id: string;
  booking_id: string;
  player_id: string;
  response_status: ResponseStatus;
  actual_status: ActualStatus | null;
  confirmed_by_admin: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingShare {
  id: string;
  booking_id: string;
  player_id: string | null;
  player_group_id: string | null;
  share_units: number;
  override_share_amount: number | null;
  amount_owed: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  payment_code: string | null;
  payment_date: string;
  payer_player_id: string | null;
  payer_group_id: string | null;
  booking_id: string | null;
  team_expense_id: string | null;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamExpense {
  id: string;
  expense_code: string | null;
  purchase_date: string;
  description: string;
  paid_by_player_id: string | null;
  paid_by_group_id: string | null;
  total_cost: number;
  split_method: SplitMethod;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamExpenseShare {
  id: string;
  team_expense_id: string;
  player_id: string | null;
  player_group_id: string | null;
  share_units: number;
  override_share_amount: number | null;
  amount_owed: number;
  notes: string | null;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  entry_date: string;
  player_id: string | null;
  player_group_id: string | null;
  source_type: SourceType;
  source_id: string | null;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  voided: boolean;
  created_at: string;
}

export interface ManualAdjustment {
  id: string;
  adjustment_date: string;
  player_id: string | null;
  player_group_id: string | null;
  amount: number;
  type: AdjustmentType;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface Balance {
  total_debit: number;
  total_credit: number;
  balance: number;
}
