-- ============================================================
-- T-POS: Titan Mafia Club — Complete Database Migration
-- Consolidated schema + all migrations + check totals fix
-- ============================================================
-- Инструкция по применению:
-- 1. Открой Supabase Dashboard → SQL Editor
-- 2. New query → скопируй этот файл → Run
-- 3. После выполнения проверь, что сайт работает
-- 4. Если возникли ошибки — скопируй их сюда для диагностики
-- ============================================================

-- ==================
-- EXTENSIONS
-- ==================
create extension if not exists "pgcrypto";

-- ==================
-- ENUM types
-- ==================
do $$ begin
  create type user_role as enum ('owner', 'staff', 'client', 'tablet');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type check_status as enum ('open', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method as enum ('cash', 'card', 'debt', 'bonus', 'split', 'deposit');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type transaction_type as enum ('supply', 'write_off', 'sale', 'revision', 'bonus_accrual', 'bonus_spend', 'cash_operation', 'debt_adjustment', 'refund');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type discount_type as enum ('percentage', 'fixed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type discount_target as enum ('check', 'item');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type space_type as enum ('cabin_small', 'cabin_big', 'hall');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type booking_status as enum ('booked', 'active', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

-- ==================
-- TABLES
-- ==================
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  nickname text not null unique,
  is_resident boolean not null default false,
  client_tier text not null default 'regular' check (client_tier in ('regular', 'resident', 'student')),
  balance numeric not null default 0,
  bonus_points numeric not null default 0,
  tg_id text unique,
  tg_username text,
  role user_role not null default 'client',
  password_hash text,
  pin text,
  phone text,
  photo_url text,
  birthday date,
  search_tags text[] not null default '{}',
  deleted_at timestamptz default null,
  permissions jsonb default null,
  linked_space_id uuid references spaces(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_tg_id on profiles(tg_id);
create index if not exists idx_profiles_nickname on profiles(nickname);

create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price numeric not null default 0,
  is_service boolean not null default false,
  track_stock boolean not null default true,
  stock_quantity numeric not null default 0,
  min_threshold numeric not null default 0,
  is_active boolean not null default true,
  is_top boolean not null default false,
  is_tablet_visible boolean default true,
  image_url text,
  sort_order integer not null default 0,
  search_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references profiles(id),
  closed_by uuid references profiles(id),
  status text not null default 'open' check (status in ('open', 'closed')),
  evening_type text check (evening_type is null or evening_type in ('sport_mafia', 'city_mafia', 'kids_mafia', 'board_games', 'no_event')),
  cash_start numeric not null default 0,
  cash_end numeric,
  note text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists idx_shifts_status on shifts(status);
create index if not exists idx_shifts_opened_at on shifts(opened_at);

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  nominal numeric not null,
  balance numeric not null,
  is_used boolean not null default false,
  used_by uuid references profiles(id),
  used_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_certificates_code on certificates(code);

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type space_type not null,
  hourly_rate numeric,
  is_active boolean not null default true
);

create table if not exists checks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references profiles(id) on delete restrict,
  staff_id uuid references profiles(id),
  shift_id uuid references shifts(id),
  space_id uuid references spaces(id),
  status check_status not null default 'open',
  total_amount numeric not null default 0,
  payment_method payment_method,
  bonus_used numeric not null default 0,
  discount_total numeric not null default 0,
  certificate_used numeric not null default 0,
  certificate_id uuid references certificates(id),
  guest_names text default null,
  note text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists idx_checks_status on checks(status);
create index if not exists idx_checks_player on checks(player_id);
create index if not exists idx_checks_shift on checks(shift_id);

create table if not exists check_items (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete restrict,
  quantity numeric not null default 1,
  price_at_time numeric not null
);

create index if not exists idx_check_items_check on check_items(check_id);

create table if not exists check_payments (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  method payment_method not null,
  amount numeric not null default 0
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type transaction_type not null,
  amount numeric not null default 0,
  description text,
  item_id uuid references inventory(id),
  check_id uuid references checks(id),
  player_id uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_type on transactions(type);
create index if not exists idx_transactions_created_at on transactions(created_at);

create table if not exists supplies (
  id uuid primary key default gen_random_uuid(),
  note text,
  total_cost numeric not null default 0,
  payment_method text not null default 'transfer' check (payment_method in ('cash', 'transfer')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_supplies_created_at on supplies(created_at);

create table if not exists supply_items (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references supplies(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete restrict,
  quantity numeric not null default 1,
  cost_per_unit numeric not null default 0,
  total_cost numeric not null default 0
);

create index if not exists idx_supply_items_supply on supply_items(supply_id);

create table if not exists discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type discount_type not null,
  value numeric not null,
  is_active boolean not null default true,
  is_auto boolean not null default false,
  min_quantity integer default null,
  item_id uuid references inventory(id) on delete set null default null,
  created_at timestamptz not null default now()
);

create table if not exists check_discounts (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  discount_id uuid references discounts(id),
  target discount_target not null default 'check',
  item_id uuid references check_items(id) on delete cascade,
  client_rule_id uuid,
  discount_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists client_discount_rules (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references discounts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(profile_id, item_id)
);

create index if not exists idx_client_discount_rules_discount on client_discount_rules(discount_id);
create index if not exists idx_client_discount_rules_profile on client_discount_rules(profile_id);
create index if not exists idx_client_discount_rules_item on client_discount_rules(item_id);

do $$
begin
  alter table check_discounts
    add constraint check_discounts_client_rule_id_fkey
    foreign key (client_rule_id) references client_discount_rules(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id),
  client_id uuid references profiles(id),
  check_id uuid references checks(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  rental_amount numeric not null default 0,
  note text,
  status booking_status not null default 'booked',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('titan', 'exit')),
  location text,
  date date not null default current_date,
  start_time time not null,
  end_time time,
  payment_type text not null default 'fixed' check (payment_type in ('fixed', 'hourly')),
  fixed_amount numeric(10, 2),
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'cancelled')),
  comment text,
  reminders jsonb default '[]'::jsonb,
  check_id uuid references checks(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references menu_categories(id) on delete set null,
  icon_name text not null default 'Package',
  color text default 'slate',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_tablet_visible boolean default true,
  created_at timestamptz not null default now()
);

create table if not exists modifiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists product_modifiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references inventory(id) on delete cascade,
  modifier_id uuid not null references modifiers(id) on delete cascade,
  unique(product_id, modifier_id)
);

create table if not exists check_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  check_item_id uuid not null references check_items(id) on delete cascade,
  modifier_id uuid not null references modifiers(id) on delete restrict,
  price_at_time numeric not null default 0
);

create table if not exists revisions (
  id uuid primary key default gen_random_uuid(),
  note text,
  total_diff numeric not null default 0,
  items_count integer not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_revisions_created_at on revisions(created_at);

create table if not exists revision_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references revisions(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete restrict,
  expected_qty numeric not null default 0,
  actual_qty numeric not null default 0,
  diff numeric not null default 0
);

create index if not exists idx_revision_items_revision on revision_items(revision_id);

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_created_at on notifications(created_at desc);

create table if not exists user_notification_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  types jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists cash_operations (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references shifts(id) on delete set null,
  type text not null check (type in ('inkassation', 'deposit', 'shift_open', 'shift_close', 'salary')),
  amount numeric not null default 0,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_operations_shift on cash_operations(shift_id);
create index if not exists idx_cash_operations_created_at on cash_operations(created_at);

create table if not exists bonus_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  balance_after numeric not null default 0,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bonus_history_profile on bonus_history(profile_id);
create index if not exists idx_bonus_history_created_at on bonus_history(created_at);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete restrict,
  shift_id uuid references shifts(id),
  refund_type text not null check (refund_type in ('full', 'partial')),
  total_amount numeric not null default 0,
  bonus_deducted numeric not null default 0,
  bonus_returned numeric not null default 0,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references refunds(id) on delete cascade,
  item_id uuid not null references inventory(id),
  quantity numeric not null default 1,
  price_at_time numeric not null default 0
);

create table if not exists tg_link_requests (
  id uuid primary key default gen_random_uuid(),
  tg_id text not null,
  tg_username text,
  tg_first_name text,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_tg_link_requests_status on tg_link_requests(status);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('rent', 'utilities', 'salary', 'other')),
  amount numeric not null,
  description text,
  expense_date date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on expenses(expense_date);
create index if not exists idx_expenses_category on expenses(category);

create table if not exists salary_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete restrict,
  amount numeric not null,
  shift_id uuid references shifts(id) on delete set null,
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  cash_operation_id uuid references cash_operations(id) on delete set null,
  paid_by uuid references profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_salary_payments_profile on salary_payments(profile_id);
create index if not exists idx_salary_payments_created_at on salary_payments(created_at);
create index if not exists idx_salary_payments_shift on salary_payments(shift_id);

create table if not exists salary_skipped_shifts (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique(shift_id)
);

create index if not exists idx_salary_skipped_shifts_shift on salary_skipped_shifts(shift_id);

create table if not exists tablet_orders (
  id uuid primary key default uuid_generate_v4(),
  space_id uuid not null references spaces(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete set null,
  status text not null default 'pending',
  comment text default '',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  processed_by uuid references profiles(id) on delete set null
);

create table if not exists tablet_order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references tablet_orders(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete cascade,
  quantity numeric not null check (quantity > 0)
);

-- ==================
-- FUNCTIONS
-- ==================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function decrement_stock(p_item_id uuid, p_qty numeric)
returns void as $$
begin
  update inventory
  set stock_quantity = stock_quantity - p_qty
  where id = p_item_id and track_stock = true;
end;
$$ language plpgsql;

create or replace function increment_stock(p_item_id uuid, p_qty numeric)
returns void as $$
begin
  update inventory set stock_quantity = stock_quantity + p_qty where id = p_item_id and track_stock = true;
end;
$$ language plpgsql;

-- ==================
-- TRIGGERS
-- ==================
drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

drop trigger if exists trg_inventory_updated_at on inventory;
create trigger trg_inventory_updated_at
  before update on inventory
  for each row execute function update_updated_at();

drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at
  before update on events
  for each row execute function update_updated_at();

-- ==================
-- RLS POLICIES
-- ==================
-- Enable RLS on all tables
alter table profiles enable row level security;
alter table inventory enable row level security;
alter table checks enable row level security;
alter table check_items enable row level security;
alter table check_payments enable row level security;
alter table transactions enable row level security;
alter table shifts enable row level security;
alter table supplies enable row level security;
alter table supply_items enable row level security;
alter table discounts enable row level security;
alter table check_discounts enable row level security;
alter table client_discount_rules enable row level security;
alter table spaces enable row level security;
alter table bookings enable row level security;
alter table events enable row level security;
alter table menu_categories enable row level security;
alter table modifiers enable row level security;
alter table product_modifiers enable row level security;
alter table check_item_modifiers enable row level security;
alter table revisions enable row level security;
alter table revision_items enable row level security;
alter table app_settings enable row level security;
alter table notifications enable row level security;
alter table cash_operations enable row level security;
alter table bonus_history enable row level security;
alter table certificates enable row level security;
alter table refunds enable row level security;
alter table refund_items enable row level security;
alter table tg_link_requests enable row level security;
alter table expenses enable row level security;
alter table salary_payments enable row level security;
alter table salary_skipped_shifts enable row level security;

-- Disable RLS for tablet_orders (custom auth)
alter table tablet_orders disable row level security;
alter table tablet_order_items disable row level security;

-- Create policies with IF NOT EXISTS
do $$ begin
  create policy "profiles_select" on profiles for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profiles_insert" on profiles for insert to anon, authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profiles_update" on profiles for update to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "inventory_select" on inventory for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "inventory_insert" on inventory for insert to anon, authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "inventory_update" on inventory for update to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "inventory_delete" on inventory for delete to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "checks_select" on checks for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "checks_insert" on checks for insert to anon, authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "checks_update" on checks for update to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "checks_delete" on checks for delete to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "check_items_all" on check_items for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "check_payments_all" on check_payments for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "transactions_select" on transactions for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "transactions_insert" on transactions for insert to anon, authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "shifts_all" on shifts for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "supplies_all" on supplies for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "supply_items_all" on supply_items for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "discounts_all" on discounts for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "check_discounts_all" on check_discounts for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "client_discount_rules_all" on client_discount_rules for all using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "spaces_all" on spaces for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "bookings_all" on bookings for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "events_all" on events for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "menu_categories_all" on menu_categories for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "modifiers_all" on modifiers for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "product_modifiers_all" on product_modifiers for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "check_item_modifiers_all" on check_item_modifiers for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "revisions_all" on revisions for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "revision_items_all" on revision_items for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "settings_select" on app_settings for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "settings_insert" on app_settings for insert to anon, authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "settings_update" on app_settings for update to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "notifications_select" on notifications for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "notifications_insert" on notifications for insert to anon, authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "cash_ops_select" on cash_operations for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "cash_ops_insert" on cash_operations for insert to anon, authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "cash_ops_delete" on cash_operations for delete to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "bonus_history_all" on bonus_history for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "certificates_all" on certificates for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "refunds_all" on refunds for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "refund_items_all" on refund_items for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "tg_link_requests_all" on tg_link_requests for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "expenses_all" on expenses for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "salary_payments_all" on salary_payments for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "salary_skipped_shifts_all" on salary_skipped_shifts for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ==================
-- REALTIME
-- ==================
do $$
begin
  alter publication supabase_realtime add table
    checks, check_items, check_discounts, inventory, shifts,
    cash_operations, bookings, profiles, events, discounts,
    supplies, revisions, refunds, menu_categories, modifiers,
    tg_link_requests, client_discount_rules, expenses, salary_payments, salary_skipped_shifts, notifications, tablet_orders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table checks replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table check_items replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table check_discounts replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table inventory replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table shifts replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table cash_operations replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table bookings replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table profiles replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table events replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table discounts replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table supplies replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table revisions replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table refunds replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table menu_categories replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table modifiers replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table tg_link_requests replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table client_discount_rules replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table expenses replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table salary_payments replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table salary_skipped_shifts replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table notifications replica identity full;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table tablet_orders replica identity full;
exception when duplicate_object then null;
end $$;

-- ==================
-- STORAGE BUCKETS
-- ==================
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('menu-images', 'menu-images', true)
  on conflict (id) do nothing;
exception when duplicate_table then null;
end $$;

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('client-photos', 'client-photos', true)
  on conflict (id) do update set public = true;
exception when duplicate_table then null;
end $$;

do $$ begin
  create policy "client_photos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'client-photos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "client_photos_insert_anon" on storage.objects for insert to anon with check (bucket_id = 'client-photos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "client_photos_select" on storage.objects for select to public using (bucket_id = 'client-photos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "client_photos_update" on storage.objects for update to anon using (bucket_id = 'client-photos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "client_photos_delete" on storage.objects for delete to authenticated using (bucket_id = 'client-photos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "client_photos_delete_anon" on storage.objects for delete to anon using (bucket_id = 'client-photos');
exception when duplicate_object then null;
end $$;

-- ==================
-- RPC: close_check
-- ==================
create or replace function close_check(
  p_check_id uuid,
  p_payments jsonb default '[]'::jsonb,
  p_bonus_used int default 0,
  p_space_rental int default 0,
  p_certificate_used int default 0,
  p_certificate_id uuid default null,
  p_discount_total int default 0,
  p_closed_by uuid default null,
  p_cart_items jsonb default '[]'::jsonb
) returns jsonb as $$
declare
  v_check record;
  v_player record;
  v_payment record;
  v_cart record;
  v_total int;
  v_final_amount int;
  v_event_amount int := 0;
  v_primary_method text;
  v_is_split boolean;
  v_debt_amount int := 0;
  v_deposit_amount int := 0;
  v_new_balance int;
  v_bonus_accrual int := 0;
  v_bonus_rate int := 10;
  v_bonus_min int := 0;
  v_bonus_enabled boolean := true;
  v_bonus_on_debt boolean := false;
  v_has_non_debt boolean := false;
  v_new_points int;
  v_cfg_val text;
  v_method_desc text;
begin
  select * into v_check from checks where id = p_check_id for update;
  
  if not found then
    return jsonb_build_object('error', 'Check not found');
  end if;
  
  if v_check.status != 'open' then
    return jsonb_build_object('error', 'Check is not open (status: ' || v_check.status || ')');
  end if;

  v_total := coalesce(v_check.total_amount, 0) + p_space_rental;
  
  select coalesce(fixed_amount, 0) into v_event_amount
    from events where check_id = p_check_id limit 1;
  if found then
    v_total := v_total + v_event_amount;
  end if;

  v_final_amount := greatest(0, v_total - p_bonus_used - p_certificate_used);

  v_is_split := jsonb_array_length(p_payments) > 1;
  if jsonb_array_length(p_payments) = 0 then
    v_primary_method := 'cash';
  elsif v_is_split then
    v_primary_method := 'split';
  else
    v_primary_method := p_payments->0->>'method';
  end if;

  update checks set
    status = 'closed',
    total_amount = v_final_amount,
    payment_method = v_primary_method::payment_method,
    bonus_used = p_bonus_used,
    certificate_used = p_certificate_used,
    certificate_id = p_certificate_id,
    discount_total = p_discount_total,
    closed_at = now()
  where id = p_check_id;

  if jsonb_array_length(p_payments) > 0 then
    insert into check_payments (check_id, method, amount)
    select p_check_id, (elem->>'method')::payment_method, (elem->>'amount')::int
    from jsonb_array_elements(p_payments) as elem;
  end if;

  if v_check.player_id is not null then
    select balance, bonus_points into v_player
      from profiles where id = v_check.player_id for update;

    if found then
      select
        coalesce(sum(case when (elem->>'method') = 'debt' then (elem->>'amount')::int else 0 end), 0),
        coalesce(sum(case when (elem->>'method') = 'deposit' then (elem->>'amount')::int else 0 end), 0),
        bool_or((elem->>'method') != 'debt')
      into v_debt_amount, v_deposit_amount, v_has_non_debt
      from jsonb_array_elements(p_payments) as elem;

      select value into v_cfg_val from app_settings where key = 'bonus_enabled';
      if v_cfg_val = 'false' then v_bonus_enabled := false; end if;

      select value into v_cfg_val from app_settings where key = 'bonus_accrual_rate';
      if v_cfg_val is not null then v_bonus_rate := v_cfg_val::int; end if;

      select value into v_cfg_val from app_settings where key = 'bonus_min_purchase';
      if v_cfg_val is not null then v_bonus_min := v_cfg_val::int; end if;

      select value into v_cfg_val from app_settings where key = 'bonus_accrual_on_debt';
      if v_cfg_val = 'true' then v_bonus_on_debt := true; end if;

      if v_bonus_enabled and v_total >= v_bonus_min and (v_has_non_debt or v_bonus_on_debt) then
        v_bonus_accrual := round(v_total * v_bonus_rate / 100.0);
      end if;

      v_new_balance := v_player.balance;
      if v_debt_amount > 0 then
        v_new_balance := v_new_balance - v_debt_amount;
      end if;
      if v_deposit_amount > 0 then
        v_new_balance := v_new_balance - v_deposit_amount;
      end if;

      v_new_points := greatest(0, v_player.bonus_points - p_bonus_used) + v_bonus_accrual;

      update profiles set
        balance = v_new_balance,
        bonus_points = v_new_points
      where id = v_check.player_id;

      if p_bonus_used > 0 then
        insert into transactions (type, amount, description, check_id, player_id, created_by)
        values ('bonus_spend', p_bonus_used, 'Списание бонусов по чеку', p_check_id, v_check.player_id, p_closed_by);

        insert into bonus_history (profile_id, amount, balance_after, reason)
        values (v_check.player_id, -p_bonus_used, greatest(0, v_player.bonus_points - p_bonus_used), 'Списание по чеку');
      end if;

      if v_bonus_accrual > 0 then
        insert into transactions (type, amount, description, check_id, player_id, created_by)
        values ('bonus_accrual', v_bonus_accrual,
                'Начисление бонусов (' || v_bonus_rate || '% от ' || v_total || '₽)',
                p_check_id, v_check.player_id, p_closed_by);

        insert into bonus_history (profile_id, amount, balance_after, reason)
        values (v_check.player_id, v_bonus_accrual, v_new_points,
                'Начисление ' || v_bonus_rate || '% от ' || v_total || '₽');
      end if;

      if v_deposit_amount > 0 then
        insert into transactions (type, amount, description, check_id, player_id, created_by)
        values ('debt_adjustment', -v_deposit_amount,
                'Оплата с депозита по чеку (было ' || v_player.balance || '₽, стало ' || v_new_balance || '₽)',
                p_check_id, v_check.player_id, p_closed_by);
      end if;
    end if;
  end if;

  v_method_desc := case
    when p_certificate_used > 0 and jsonb_array_length(p_payments) > 0 then
      'сертификат + ' || case when v_is_split then 'разд. оплата' else coalesce(v_primary_method, 'cash') end
    when p_certificate_used > 0 then 'сертификат'
    when v_is_split then 'разд. оплата'
    else coalesce(v_primary_method, 'cash')
  end;

  insert into transactions (type, amount, description, check_id, player_id, created_by)
  values ('sale', v_final_amount, 'Закрытие чека (' || v_method_desc || ')',
          p_check_id, v_check.player_id, p_closed_by);

  if p_certificate_used > 0 then
    insert into transactions (type, amount, description, check_id, player_id, created_by)
    values ('sale', 0,
            'Оплата сертификатом: ' || p_certificate_used || '₽' ||
              case when p_certificate_id is not null then ' (' || left(p_certificate_id::text, 8) || ')' else '' end,
            p_check_id, v_check.player_id, p_closed_by);
  end if;

  for v_cart in select * from jsonb_array_elements(p_cart_items) loop
    perform decrement_stock(
      (v_cart.value->>'item_id')::uuid,
      (v_cart.value->>'quantity')::numeric
    );
  end loop;

  if v_check.space_id is not null then
    update bookings set status = 'completed'
    where check_id = p_check_id and status = 'active';
  end if;

  update events set status = 'completed'
  where check_id = p_check_id and status != 'completed';

  return jsonb_build_object(
    'success', true,
    'final_amount', v_final_amount,
    'bonus_accrual', v_bonus_accrual,
    'method', v_primary_method
  );
end;
$$ language plpgsql;

-- ==================
-- SEED DATA (app_settings only - safe to re-run)
-- ==================
do $$
begin
  insert into app_settings (key, value) values
    ('bonus_accrual_rate', '10'),
    ('bonus_min_purchase', '0'),
    ('bonus_enabled', 'true'),
    ('bonus_accrual_on_debt', 'false'),
    ('notification_admin_channel', 'telegram'),
    ('notification_admin_telegram_chat_ids', '556525624,1005574994'),
    ('notification_admin_types', '{"shift_open":true,"shift_close":true,"payment_cash":true,"payment_card":true,"payment_deposit":true,"payment_debt":true,"birthday":true}'),
    ('notification_client_bonus_accrual', 'true'),
    ('notification_client_bonus_spend', 'true')
  on conflict (key) do nothing;
exception when others then null;
end $$;

-- Menu categories
do $$
begin
  insert into menu_categories (name, slug, sort_order, icon_name, color) values
    ('Услуги', 'services', 10, 'Timer', 'indigo'),
    ('Напитки', 'drinks', 20, 'GlassWater', 'blue'),
    ('Еда', 'food', 30, 'UtensilsCrossed', 'orange'),
    ('Снеки', 'bar', 40, 'Cookie', 'amber'),
    ('Кальяны', 'hookah', 50, 'Wind', 'violet');
exception when others then null;
end $$;

-- Spaces
do $$
begin
  insert into spaces (name, type, hourly_rate) values
    ('Маленькая кабинка', 'cabin_small', 250),
    ('Большая кабинка', 'cabin_big', 500),
    ('Зал', 'hall', null);
exception when others then null;
end $$;

-- ============================================================
-- ОПЦИОНАЛЬНО: Исправление сумм закрытых чеков
-- РАСКОММЕНТИРУЙ ТОЛЬКО ЕСЛИ НУЖНО ИСПРАВИТЬ СТАРЫЕ ЧЕКИ
-- ============================================================

/*
WITH check_totals AS (
  SELECT
    c.id,
    COALESCE(SUM(ci.price_at_time * ci.quantity), 0) AS items_total,
    COALESCE(SUM(cd.discount_amount), 0) AS discounts_total
  FROM checks c
  LEFT JOIN check_items ci ON ci.check_id = c.id
  LEFT JOIN check_discounts cd ON cd.check_id = c.id
  WHERE c.status = 'closed'
  GROUP BY c.id
)
UPDATE checks
SET
  total_amount = GREATEST(0, ct.items_total - ct.discounts_total),
  discount_total = ct.discounts_total
FROM check_totals ct
WHERE checks.id = ct.id
  AND (checks.total_amount IS DISTINCT FROM GREATEST(0, ct.items_total - ct.discounts_total)
       OR checks.discount_total IS DISTINCT FROM ct.discounts_total);

WITH check_totals AS (
  SELECT
    c.id,
    GREATEST(0,
      COALESCE(SUM(ci.price_at_time * ci.quantity), 0)
      - COALESCE(SUM(cd.discount_amount), 0)
    ) AS correct_total
  FROM checks c
  LEFT JOIN check_items ci ON ci.check_id = c.id
  LEFT JOIN check_discounts cd ON cd.check_id = c.id
  WHERE c.status = 'closed'
  GROUP BY c.id
  HAVING GREATEST(0,
    COALESCE(SUM(ci.price_at_time * ci.quantity), 0)
    - COALESCE(SUM(cd.discount_amount), 0)
  ) > 0
)
UPDATE transactions
SET amount = ct.correct_total
FROM check_totals ct
WHERE transactions.check_id = ct.id
  AND transactions.type = 'sale'
  AND transactions.amount = 0;
*/
