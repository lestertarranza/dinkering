-- Add bank transfer details to app_settings for payment reminders.
alter table app_settings
  add column if not exists bank_transfer_details text;
