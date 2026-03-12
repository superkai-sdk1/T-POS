-- ============================================
-- T-POS: Titan Mafia Club — Full Database Schema
-- Single consolidated migration file
-- ============================================

create extension if not exists "pgcrypto";

-- ==================
-- ENUM types
-- ==================
create type user_role as enum ('owner', 'staff', 'client');
create type check_status as enum ('open', 'closed');
create type payment_method as enum ('cash', 'card', 'debt', 'bonus', 'split', 'deposit');
create type transaction_type as enum ('supply', 'write_off', 'sale', 'revision', 'bonus_accrual', 'bonus_spend', 'cash_operation', 'debt_adjustment', 'refund');
create type discount_type as enum ('percentage', 'fixed');
create type discount_target as enum ('check', 'item');
create type space_type as enum ('cabin_small', 'cabin_big', 'hall');
create type booking_status as enum ('booked', 'active', 'completed', 'cancelled');

-- ==================
-- profiles
-- ==================
create table profiles (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_tg_id on profiles(tg_id);
create index idx_profiles_nickname on profiles(nickname);

-- ==================
-- inventory
-- ==================
create table inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price numeric not null default 0,
  stock_quantity numeric not null default 0,
  min_threshold numeric not null default 0,
  is_active boolean not null default true,
  is_top boolean not null default false,
  image_url text,
  sort_order integer not null default 0,
  search_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==================
-- shifts
-- ==================
create table shifts (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references profiles(id),
  closed_by uuid references profiles(id),
  status text not null default 'open' check (status in ('open', 'closed')),
  cash_start numeric not null default 0,
  cash_end numeric,
  note text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create index idx_shifts_status on shifts(status);
create index idx_shifts_opened_at on shifts(opened_at);

-- ==================
-- certificates
-- ==================
create table certificates (
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

create index idx_certificates_code on certificates(code);

-- ==================
-- spaces
-- ==================
create table spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type space_type not null,
  hourly_rate numeric,
  is_active boolean not null default true
);

-- ==================
-- checks
-- ==================
create table checks (
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

create index idx_checks_status on checks(status);
create index idx_checks_player on checks(player_id);
create index idx_checks_shift on checks(shift_id);

-- ==================
-- check_items
-- ==================
create table check_items (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete restrict,
  quantity numeric not null default 1,
  price_at_time numeric not null
);

create index idx_check_items_check on check_items(check_id);

-- ==================
-- check_payments (split payments)
-- ==================
create table check_payments (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  method payment_method not null,
  amount numeric not null default 0
);

-- ==================
-- transactions (audit log)
-- ==================
create table transactions (
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

create index idx_transactions_type on transactions(type);
create index idx_transactions_created_at on transactions(created_at);

-- ==================
-- supplies
-- ==================
create table supplies (
  id uuid primary key default gen_random_uuid(),
  note text,
  total_cost numeric not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_supplies_created_at on supplies(created_at);

-- ==================
-- supply_items
-- ==================
create table supply_items (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references supplies(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete restrict,
  quantity numeric not null default 1,
  cost_per_unit numeric not null default 0,
  total_cost numeric not null default 0
);

create index idx_supply_items_supply on supply_items(supply_id);

-- ==================
-- discounts
-- ==================
create table discounts (
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

create table check_discounts (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  discount_id uuid references discounts(id),
  target discount_target not null default 'check',
  item_id uuid references check_items(id) on delete cascade,
  client_rule_id uuid,
  discount_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ==================
-- client_discount_rules
-- ==================
create table client_discount_rules (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references discounts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(profile_id, item_id)
);

create index idx_client_discount_rules_discount on client_discount_rules(discount_id);
create index idx_client_discount_rules_profile on client_discount_rules(profile_id);
create index idx_client_discount_rules_item on client_discount_rules(item_id);

alter table check_discounts
  add constraint check_discounts_client_rule_id_fkey
  foreign key (client_rule_id) references client_discount_rules(id) on delete set null;

-- ==================
-- bookings
-- ==================
create table bookings (
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

-- ==================
-- events
-- ==================
create table events (
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

-- ==================
-- menu_categories
-- ==================
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references menu_categories(id) on delete set null,
  icon_name text not null default 'Package',
  color text default 'slate',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ==================
-- modifiers
-- ==================
create table modifiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_modifiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references inventory(id) on delete cascade,
  modifier_id uuid not null references modifiers(id) on delete cascade,
  unique(product_id, modifier_id)
);

create table check_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  check_item_id uuid not null references check_items(id) on delete cascade,
  modifier_id uuid not null references modifiers(id) on delete restrict,
  price_at_time numeric not null default 0
);

-- ==================
-- revisions
-- ==================
create table revisions (
  id uuid primary key default gen_random_uuid(),
  note text,
  total_diff numeric not null default 0,
  items_count integer not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_revisions_created_at on revisions(created_at);

create table revision_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references revisions(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete restrict,
  expected_qty numeric not null default 0,
  actual_qty numeric not null default 0,
  diff numeric not null default 0
);

create index idx_revision_items_revision on revision_items(revision_id);

-- ==================
-- app_settings
-- ==================
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ==================
-- cash_operations
-- ==================
create table cash_operations (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references shifts(id) on delete set null,
  type text not null check (type in ('inkassation', 'deposit', 'shift_open', 'shift_close')),
  amount numeric not null default 0,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_cash_operations_shift on cash_operations(shift_id);
create index idx_cash_operations_created_at on cash_operations(created_at);

-- ==================
-- bonus_history
-- ==================
create table bonus_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  balance_after numeric not null default 0,
  reason text not null,
  created_at timestamptz not null default now()
);

create index idx_bonus_history_profile on bonus_history(profile_id);
create index idx_bonus_history_created_at on bonus_history(created_at);

-- ==================
-- refunds
-- ==================
create table refunds (
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

create table refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references refunds(id) on delete cascade,
  item_id uuid not null references inventory(id),
  quantity numeric not null default 1,
  price_at_time numeric not null default 0
);

-- ==================
-- tg_link_requests
-- ==================
create table tg_link_requests (
  id uuid primary key default gen_random_uuid(),
  tg_id text not null,
  tg_username text,
  tg_first_name text,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index idx_tg_link_requests_status on tg_link_requests(status);

-- ==================
-- expenses
-- ==================
create table expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('rent', 'utilities', 'salary', 'other')),
  amount numeric not null,
  description text,
  expense_date date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_expenses_date on expenses(expense_date);
create index idx_expenses_category on expenses(category);

-- ==============================
-- Functions
-- ==============================
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
  update inventory set stock_quantity = greatest(0, stock_quantity - p_qty) where id = p_item_id;
end;
$$ language plpgsql;

create or replace function increment_stock(p_item_id uuid, p_qty numeric)
returns void as $$
begin
  update inventory set stock_quantity = stock_quantity + p_qty where id = p_item_id;
end;
$$ language plpgsql;

-- ==============================
-- Triggers
-- ==============================
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger trg_inventory_updated_at
  before update on inventory
  for each row execute function update_updated_at();

create trigger trg_events_updated_at
  before update on events
  for each row execute function update_updated_at();

-- ==============================
-- RLS Policies
-- ==============================
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
alter table cash_operations enable row level security;
alter table bonus_history enable row level security;
alter table certificates enable row level security;
alter table refunds enable row level security;
alter table refund_items enable row level security;
alter table tg_link_requests enable row level security;
alter table expenses enable row level security;

create policy "profiles_select" on profiles for select to anon, authenticated using (true);
create policy "profiles_insert" on profiles for insert to anon, authenticated with check (true);
create policy "profiles_update" on profiles for update to anon, authenticated using (true);

create policy "inventory_select" on inventory for select to anon, authenticated using (true);
create policy "inventory_insert" on inventory for insert to anon, authenticated with check (true);
create policy "inventory_update" on inventory for update to anon, authenticated using (true);
create policy "inventory_delete" on inventory for delete to anon, authenticated using (true);

create policy "checks_select" on checks for select to anon, authenticated using (true);
create policy "checks_insert" on checks for insert to anon, authenticated with check (true);
create policy "checks_update" on checks for update to anon, authenticated using (true);
create policy "checks_delete" on checks for delete to anon, authenticated using (true);

create policy "check_items_all" on check_items for all to anon, authenticated using (true) with check (true);
create policy "check_payments_all" on check_payments for all to anon, authenticated using (true) with check (true);
create policy "transactions_select" on transactions for select to anon, authenticated using (true);
create policy "transactions_insert" on transactions for insert to anon, authenticated with check (true);

create policy "shifts_all" on shifts for all to anon, authenticated using (true) with check (true);
create policy "supplies_all" on supplies for all to anon, authenticated using (true) with check (true);
create policy "supply_items_all" on supply_items for all to anon, authenticated using (true) with check (true);
create policy "discounts_all" on discounts for all to anon, authenticated using (true) with check (true);
create policy "check_discounts_all" on check_discounts for all to anon, authenticated using (true) with check (true);
create policy "client_discount_rules_all" on client_discount_rules for all using (true) with check (true);
create policy "spaces_all" on spaces for all to anon, authenticated using (true) with check (true);
create policy "bookings_all" on bookings for all to anon, authenticated using (true) with check (true);
create policy "events_all" on events for all to anon, authenticated using (true) with check (true);
create policy "menu_categories_all" on menu_categories for all to anon, authenticated using (true) with check (true);
create policy "modifiers_all" on modifiers for all to anon, authenticated using (true) with check (true);
create policy "product_modifiers_all" on product_modifiers for all to anon, authenticated using (true) with check (true);
create policy "check_item_modifiers_all" on check_item_modifiers for all to anon, authenticated using (true) with check (true);
create policy "revisions_all" on revisions for all to anon, authenticated using (true) with check (true);
create policy "revision_items_all" on revision_items for all to anon, authenticated using (true) with check (true);
create policy "settings_select" on app_settings for select to anon, authenticated using (true);
create policy "settings_insert" on app_settings for insert to anon, authenticated with check (true);
create policy "settings_update" on app_settings for update to anon, authenticated using (true);
create policy "cash_ops_select" on cash_operations for select to anon, authenticated using (true);
create policy "cash_ops_insert" on cash_operations for insert to anon, authenticated with check (true);
create policy "cash_ops_delete" on cash_operations for delete to anon, authenticated using (true);
create policy "bonus_history_all" on bonus_history for all to anon, authenticated using (true) with check (true);
create policy "certificates_all" on certificates for all to anon, authenticated using (true) with check (true);
create policy "refunds_all" on refunds for all to anon, authenticated using (true) with check (true);
create policy "refund_items_all" on refund_items for all to anon, authenticated using (true) with check (true);
create policy "tg_link_requests_all" on tg_link_requests for all to anon, authenticated using (true) with check (true);
create policy "expenses_all" on expenses for all to anon, authenticated using (true) with check (true);

-- ==============================
-- Realtime
-- ==============================
alter publication supabase_realtime add table
  checks, check_items, check_discounts, inventory, shifts,
  cash_operations, bookings, profiles, events, discounts,
  supplies, revisions, refunds, menu_categories, modifiers,
  tg_link_requests, client_discount_rules, expenses;

alter table checks replica identity full;
alter table check_items replica identity full;
alter table check_discounts replica identity full;
alter table inventory replica identity full;
alter table shifts replica identity full;
alter table cash_operations replica identity full;
alter table bookings replica identity full;
alter table profiles replica identity full;
alter table events replica identity full;
alter table discounts replica identity full;
alter table supplies replica identity full;
alter table revisions replica identity full;
alter table refunds replica identity full;
alter table menu_categories replica identity full;
alter table modifiers replica identity full;
alter table tg_link_requests replica identity full;
alter table client_discount_rules replica identity full;
alter table expenses replica identity full;

-- ==============================
-- Storage buckets
-- ==============================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('client-photos', 'client-photos', true)
on conflict (id) do update set public = true;

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

-- =============================================
-- SEED DATA
-- =============================================

-- App settings
insert into app_settings (key, value) values
  ('bonus_accrual_rate', '10'),
  ('bonus_min_purchase', '0'),
  ('bonus_enabled', 'true'),
  ('bonus_accrual_on_debt', 'false')
on conflict (key) do nothing;

-- Menu categories
insert into menu_categories (name, slug, sort_order, icon_name, color) values
  ('Услуги', 'services', 10, 'Timer', 'indigo'),
  ('Напитки', 'drinks', 20, 'GlassWater', 'blue'),
  ('Еда', 'food', 30, 'UtensilsCrossed', 'orange'),
  ('Снеки', 'bar', 40, 'Cookie', 'amber'),
  ('Кальяны', 'hookah', 50, 'Wind', 'violet');

-- Spaces
insert into spaces (name, type, hourly_rate) values
  ('Маленькая кабинка', 'cabin_small', 250),
  ('Большая кабинка', 'cabin_big', 500),
  ('Зал', 'hall', null);

-- Owner accounts
insert into profiles (nickname, is_resident, role, password_hash, tg_id, pin) values
  ('Титан', true, 'owner', 'titan2024', '556525624', null),
  ('Kai', true, 'owner', 'titan2024', '1005574994', '0780');

-- Players
insert into profiles (nickname, is_resident, role) values
  ('Менталист', false, 'client'),
  ('Ханна', false, 'client'),
  ('Моника', false, 'client'),
  ('Китана', false, 'client'),
  ('Alien', false, 'client'),
  ('Сенатор', false, 'client'),
  ('Чиф', false, 'client'),
  ('Мэл', false, 'client'),
  ('Дмитрий', false, 'client'),
  ('Малекула', false, 'client'),
  ('Горький', false, 'client'),
  ('Оскар', false, 'client'),
  ('Цезарь', false, 'client'),
  ('Nevada', false, 'client'),
  ('Чипо', false, 'client'),
  ('Атом', false, 'client'),
  ('Гость', false, 'client'),
  ('Inko', false, 'client'),
  ('Айс', false, 'client'),
  ('Agasshi', false, 'client'),
  ('Азраил', false, 'client'),
  ('Альба', false, 'client'),
  ('Икс', false, 'client'),
  ('Нафиля', false, 'client'),
  ('Великая', false, 'client'),
  ('Саид', false, 'client'),
  ('Tam', false, 'client'),
  ('Neo', false, 'client'),
  ('ProDoc', false, 'client'),
  ('Hisoka', false, 'client'),
  ('Копибара', false, 'client'),
  ('Йору', false, 'client'),
  ('Animag', false, 'client'),
  ('Маркетолог', false, 'client'),
  ('Бес', false, 'client'),
  ('Хейтер', false, 'client'),
  ('Лобио', false, 'client'),
  ('Лестер', false, 'client'),
  ('Dushman', false, 'client'),
  ('Дэва', false, 'client'),
  ('Марсело', false, 'client'),
  ('Биполярка', false, 'client'),
  ('Альтман', false, 'client'),
  ('Мансур', false, 'client'),
  ('Мафия', false, 'client'),
  ('Ева', false, 'client'),
  ('Даня', false, 'client'),
  ('Фил', false, 'client'),
  ('Зёма', false, 'client'),
  ('Мау', false, 'client'),
  ('Miamore', false, 'client'),
  ('Паранойя', false, 'client'),
  ('Томас Шелби', false, 'client'),
  ('Минахор', false, 'client'),
  ('EL', false, 'client'),
  ('Dizi', false, 'client'),
  ('Рок', false, 'client'),
  ('Типсон', false, 'client'),
  ('Лазер', false, 'client'),
  ('Физик', false, 'client'),
  ('Black Jack', false, 'client'),
  ('Кари', false, 'client'),
  ('Темир', false, 'client'),
  ('evil', false, 'client'),
  ('Саливан', false, 'client'),
  ('Дита', false, 'client'),
  ('finnick', false, 'client'),
  ('Black', false, 'client'),
  ('Статистика', false, 'client'),
  ('Saul Goodman', false, 'client'),
  ('Кобра', false, 'client'),
  ('Знаток', false, 'client'),
  ('Окси', false, 'client'),
  ('Элис', false, 'client'),
  ('Завклубом', false, 'client'),
  ('Пантера', false, 'client'),
  ('Подкова', false, 'client'),
  ('Булочка', false, 'client'),
  ('Асур', false, 'client'),
  ('Феникс', false, 'client'),
  ('Светлячок', false, 'client'),
  ('Кир', false, 'client'),
  ('Кира', false, 'client'),
  ('Учитель', false, 'client'),
  ('Штиль', false, 'client'),
  ('Психолог', false, 'client'),
  ('Ivory', false, 'client'),
  ('Руди', false, 'client'),
  ('Лимонная долька', false, 'client'),
  ('Добрый', false, 'client'),
  ('Красавчик', false, 'client'),
  ('Сатору', false, 'client'),
  ('Космос', false, 'client'),
  ('Dill', false, 'client'),
  ('Луи', false, 'client'),
  ('Валькирия', false, 'client'),
  ('Кову', false, 'client'),
  ('Scorpion', false, 'client'),
  ('Индийский слон', false, 'client'),
  ('Сирена', false, 'client'),
  ('Адвокат', false, 'client'),
  ('Зара', false, 'client'),
  ('Зайка', false, 'client'),
  ('Саймон', false, 'client'),
  ('Gestalter', false, 'client'),
  ('DULASHA', false, 'client'),
  ('SOZA', false, 'client'),
  ('МРАК', false, 'client'),
  ('AMOR', false, 'client'),
  ('СКОРПИОН', false, 'client'),
  ('BITTIR', false, 'client'),
  ('SHINOBI', false, 'client'),
  ('РОКФОР', false, 'client'),
  ('Альфа', false, 'client'),
  ('TONI MONTANA', false, 'client'),
  ('Данте', false, 'client'),
  ('Geralt', false, 'client'),
  ('Alinellas', false, 'client'),
  ('ASIA', false, 'client'),
  ('GREMLIN', false, 'client'),
  ('Подсолнух', false, 'client'),
  ('FOX', false, 'client'),
  ('LIRICA', false, 'client'),
  ('Mulan', false, 'client'),
  ('ZONDR', false, 'client'),
  ('Смурфик', false, 'client');

-- Inventory: drinks
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  ('Палпи', 'drinks', 120, 0, 3),
  ('Чай холодный', 'drinks', 100, 3, 3),
  ('Вода Бабугент', 'drinks', 100, 24, 5),
  ('Вода Родниковая', 'drinks', 30, 37, 5),
  ('Флэш', 'drinks', 120, 10, 3),
  ('Кола Стекло', 'drinks', 150, 0, 3),
  ('Вода Бабугент газ', 'drinks', 100, 18, 5),
  ('Фанта', 'drinks', 150, 0, 3),
  ('Пепси', 'drinks', 150, 0, 3),
  ('Добрый ЖБ', 'drinks', 120, 29, 5),
  ('Адреналин', 'drinks', 220, 13, 3),
  ('Горилла', 'drinks', 150, 0, 3),
  ('Берн', 'drinks', 200, 9, 3),
  ('Драгон', 'drinks', 100, 0, 3),
  ('Kinza', 'drinks', 120, 53, 5),
  ('Акапелла', 'drinks', 180, 18, 3),
  ('Адреналин Мини', 'drinks', 120, 10, 3),
  ('Коктейли', 'drinks', 350, 0, 0),
  ('Шоты', 'drinks', 150, 0, 0),
  ('Жигули', 'drinks', 150, 0, 3),
  ('Ловенбрау светлое', 'drinks', 150, 0, 3),
  ('Бад', 'drinks', 200, 0, 3),
  ('Ловенбрау 0%', 'drinks', 150, 8, 3),
  ('Ловенбрау Темное', 'drinks', 200, 1, 3),
  ('Хугарден', 'drinks', 200, 4, 3),
  ('Чай', 'drinks', 50, 240, 10),
  ('Кофе', 'drinks', 50, 0, 0),
  ('Эспрессо', 'drinks', 120, 0, 0),
  ('Американо', 'drinks', 160, 0, 0),
  ('Капучино', 'drinks', 190, 0, 0),
  ('Латте', 'drinks', 220, 0, 0),
  ('Эспрессо-Тоник', 'drinks', 240, 0, 0),
  ('Бамбл', 'drinks', 270, 0, 0),
  ('Айс-Латте', 'drinks', 270, 0, 0),
  ('Какао', 'drinks', 270, 35, 5),
  ('Воронка V60', 'drinks', 260, 0, 0);

-- Inventory: food
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  ('Заказ еды', 'food', 1, 99999, 0),
  ('Саид с Курицей', 'food', 250, 0, 3),
  ('Лирика с курицей', 'food', 250, 0, 3),
  ('Данте с Ананасами', 'food', 250, 0, 3),
  ('Альтман с Крабом', 'food', 250, 0, 3),
  ('Советский Минахор', 'food', 250, 0, 3),
  ('Бургер с курицей', 'food', 240, 18, 3),
  ('Бургер с говядиной', 'food', 280, 10, 3),
  ('Панини с индейкой', 'food', 210, 0, 3),
  ('Чикен-бокс', 'food', 290, 20, 3),
  ('Сэндвич с индейкой', 'food', 250, 33, 3),
  ('Хот-дог', 'food', 180, 17, 3),
  ('Стрипсы', 'food', 290, 21, 3),
  ('Сэндвич Веганский', 'food', 250, 13, 3);

-- Inventory: bar/snacks
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  ('Чипсы', 'bar', 150, 21, 5),
  ('Шоколадки', 'bar', 150, 40, 5),
  ('Мармелад', 'bar', 200, 0, 3),
  ('Семечки', 'bar', 180, 2, 3),
  ('Сухарики', 'bar', 80, 17, 3),
  ('Батончики', 'bar', 50, 35, 5),
  ('Арахис', 'bar', 200, 3, 3),
  ('Ореховый микс', 'bar', 250, 0, 3);

-- Inventory: hookah
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  ('Кальян Hard', 'hookah', 1000, 0, 0),
  ('Кальян Soft', 'hookah', 700, 0, 0),
  ('Кальян без табака', 'hookah', 500, 0, 0);

-- Inventory: services
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  ('Игровой вечер Резидент', 'services', 500, 0, 0),
  ('Игровой вечер Студент', 'services', 300, 0, 0),
  ('Игровой вечер Гость', 'services', 700, 0, 0),
  ('Игровой вечер Одна игра', 'services', 150, 0, 0),
  ('Кабинка', 'services', 200, 0, 0),
  ('Ивент', 'services', 1000, 0, 0),
  ('ШТРАФ', 'services', 100, 0, 0);

-- Staff PINs
update profiles set pin = '0000' where nickname = 'Салим' and pin is null;
update profiles set pin = '5757' where nickname = 'Тигран' and pin is null;
update profiles set pin = '0780' where nickname = 'Kai' and pin is null;
