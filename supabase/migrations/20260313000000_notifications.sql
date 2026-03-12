-- Notifications table and app_settings for notification config
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_created_at on notifications(created_at desc);

alter table notifications enable row level security;
create policy "notifications_select" on notifications for select to anon, authenticated using (true);
create policy "notifications_insert" on notifications for insert to anon, authenticated with check (true);

alter publication supabase_realtime add table notifications;
alter table notifications replica identity full;

insert into app_settings (key, value) values
  ('notification_admin_channel', 'telegram'),
  ('notification_admin_telegram_chat_ids', '556525624,1005574994'),
  ('notification_admin_types', '{"shift_open":true,"shift_close":true,"payment_cash":true,"payment_card":true,"payment_deposit":true,"payment_debt":true,"birthday":true}'),
  ('notification_client_bonus_accrual', 'true'),
  ('notification_client_bonus_spend', 'true')
on conflict (key) do nothing;
