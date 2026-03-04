-- ============================================
-- T-POS: Titan Mafia Club - Database Schema
-- Real data imported from QuickResto backup
-- ============================================

create extension if not exists "pgcrypto";

-- ==================
-- ENUM types
-- ==================
create type user_role as enum ('owner', 'staff', 'client');
create type item_category as enum ('drinks', 'food', 'bar', 'hookah', 'services');
create type check_status as enum ('open', 'closed');
create type payment_method as enum ('cash', 'card', 'debt', 'bonus');
create type transaction_type as enum ('supply', 'write_off', 'sale', 'revision', 'bonus_accrual', 'bonus_spend', 'cash_operation', 'debt_adjustment');

-- ==================
-- profiles
-- ==================
create table profiles (
  id uuid primary key default gen_random_uuid(),
  nickname text not null unique,
  is_resident boolean not null default false,
  balance numeric not null default 0,
  bonus_points numeric not null default 0,
  tg_id text unique,
  role user_role not null default 'client',
  password_hash text,
  pin text,
  phone text,
  photo_url text,
  birthday date,
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
  category item_category not null,
  price numeric not null default 0,
  stock_quantity numeric not null default 0,
  min_threshold numeric not null default 0,
  is_active boolean not null default true,
  image_url text,
  sort_order integer not null default 0,
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
-- checks (player tabs/orders)
-- ==================
create table checks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references profiles(id) on delete restrict,
  staff_id uuid references profiles(id),
  shift_id uuid references shifts(id),
  status check_status not null default 'open',
  total_amount numeric not null default 0,
  payment_method payment_method,
  bonus_used numeric not null default 0,
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
-- supplies (delivery receipts)
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
-- updated_at trigger
-- ==================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger trg_inventory_updated_at
  before update on inventory
  for each row execute function update_updated_at();

-- ==================
-- RLS Policies
-- ==================

alter table profiles enable row level security;
alter table inventory enable row level security;
alter table checks enable row level security;
alter table check_items enable row level security;
alter table transactions enable row level security;

create policy "profiles_select" on profiles for select to anon, authenticated using (true);
create policy "profiles_insert" on profiles for insert to anon, authenticated with check (true);
create policy "profiles_update" on profiles for update to anon, authenticated using (true);

create policy "inventory_select" on inventory for select to anon, authenticated using (true);
create policy "inventory_insert" on inventory for insert to anon, authenticated with check (true);
create policy "inventory_update" on inventory for update to anon, authenticated using (true);

create policy "checks_select" on checks for select to anon, authenticated using (true);
create policy "checks_insert" on checks for insert to anon, authenticated with check (true);
create policy "checks_update" on checks for update to anon, authenticated using (true);
create policy "checks_delete" on checks for delete to anon, authenticated using (true);

create policy "check_items_select" on check_items for select to anon, authenticated using (true);
create policy "check_items_insert" on check_items for insert to anon, authenticated with check (true);
create policy "check_items_update" on check_items for update to anon, authenticated using (true);
create policy "check_items_delete" on check_items for delete to anon, authenticated using (true);

create policy "transactions_select" on transactions for select to anon, authenticated using (true);
create policy "transactions_insert" on transactions for insert to anon, authenticated with check (true);

alter table shifts enable row level security;
create policy "shifts_select" on shifts for select to anon, authenticated using (true);
create policy "shifts_insert" on shifts for insert to anon, authenticated with check (true);
create policy "shifts_update" on shifts for update to anon, authenticated using (true);
create policy "shifts_delete" on shifts for delete to anon, authenticated using (true);

alter table supplies enable row level security;
alter table supply_items enable row level security;

create policy "supplies_select" on supplies for select to anon, authenticated using (true);
create policy "supplies_insert" on supplies for insert to anon, authenticated with check (true);
create policy "supplies_update" on supplies for update to anon, authenticated using (true);
create policy "supplies_delete" on supplies for delete to anon, authenticated using (true);

create policy "supply_items_select" on supply_items for select to anon, authenticated using (true);
create policy "supply_items_insert" on supply_items for insert to anon, authenticated with check (true);
create policy "supply_items_update" on supply_items for update to anon, authenticated using (true);
create policy "supply_items_delete" on supply_items for delete to anon, authenticated using (true);

-- =============================================
-- SEED DATA: Owner account (password: titan2024)
-- =============================================
insert into profiles (nickname, is_resident, role, password_hash, tg_id) values
  ('Титан', true, 'owner', 'titan2024', '556525624'),
  ('Kai', true, 'owner', 'titan2024', '1005574994');

-- =============================================
-- SEED DATA: Players from QuickResto backup
-- =============================================
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

-- =============================================
-- SEED DATA: Inventory from QuickResto backup
-- =============================================

-- Напитки (drinks): холодные, горячие, пиво, кофемашинка
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  -- Холодные напитки
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
  -- Пиво
  ('Жигули', 'drinks', 150, 0, 3),
  ('Ловенбрау светлое', 'drinks', 150, 0, 3),
  ('Бад', 'drinks', 200, 0, 3),
  ('Ловенбрау 0%', 'drinks', 150, 8, 3),
  ('Ловенбрау Темное', 'drinks', 200, 1, 3),
  ('Хугарден', 'drinks', 200, 4, 3),
  -- Горячие напитки
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

-- Еда (food)
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

-- Бар / Снеки
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  ('Чипсы', 'bar', 150, 21, 5),
  ('Шоколадки', 'bar', 150, 40, 5),
  ('Мармелад', 'bar', 200, 0, 3),
  ('Семечки', 'bar', 180, 2, 3),
  ('Сухарики', 'bar', 80, 17, 3),
  ('Батончики', 'bar', 50, 35, 5),
  ('Арахис', 'bar', 200, 3, 3),
  ('Ореховый микс', 'bar', 250, 0, 3);

-- Кальяны (hookah)
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  ('Кальян Hard', 'hookah', 1000, 0, 0),
  ('Кальян Soft', 'hookah', 700, 0, 0),
  ('Кальян без табака', 'hookah', 500, 0, 0);

-- Услуги / Вечера (services)
insert into inventory (name, category, price, stock_quantity, min_threshold) values
  ('Игровой вечер Резидент', 'services', 500, 0, 0),
  ('Игровой вечер Студент', 'services', 300, 0, 0),
  ('Игровой вечер Гость', 'services', 700, 0, 0),
  ('Игровой вечер Одна игра', 'services', 150, 0, 0),
  ('Кабинка', 'services', 200, 0, 0),
  ('Ивент', 'services', 1000, 0, 0),
  ('ШТРАФ', 'services', 100, 0, 0);

-- ==============================
-- Revisions tracking
-- ==============================
create table if not exists revisions (
  id uuid primary key default gen_random_uuid(),
  note text,
  total_diff numeric not null default 0,
  items_count integer not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_revisions_created_at on revisions(created_at);
alter table revisions enable row level security;
create policy "revisions_select" on revisions for select to anon, authenticated using (true);
create policy "revisions_insert" on revisions for insert to anon, authenticated with check (true);
create policy "revisions_update" on revisions for update to anon, authenticated using (true);
create policy "revisions_delete" on revisions for delete to anon, authenticated using (true);

create table if not exists revision_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references revisions(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete restrict,
  expected_qty numeric not null default 0,
  actual_qty numeric not null default 0,
  diff numeric not null default 0
);
create index if not exists idx_revision_items_revision on revision_items(revision_id);
alter table revision_items enable row level security;
create policy "revision_items_select" on revision_items for select to anon, authenticated using (true);
create policy "revision_items_insert" on revision_items for insert to anon, authenticated with check (true);

-- ==============================
-- App settings (bonus config, etc.)
-- ==============================
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
create policy "settings_select" on app_settings for select to anon, authenticated using (true);
create policy "settings_insert" on app_settings for insert to anon, authenticated with check (true);
create policy "settings_update" on app_settings for update to anon, authenticated using (true);

insert into app_settings (key, value) values
  ('bonus_accrual_rate', '10'),
  ('bonus_min_purchase', '0'),
  ('bonus_enabled', 'true'),
  ('bonus_accrual_on_debt', 'false')
on conflict (key) do nothing;

-- ==============================
-- Cash operations (inkassation, deposit)
-- ==============================
create table if not exists cash_operations (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references shifts(id) on delete set null,
  type text not null check (type in ('inkassation', 'deposit')),
  amount numeric not null default 0,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_cash_operations_shift on cash_operations(shift_id);
create index if not exists idx_cash_operations_created_at on cash_operations(created_at);
alter table cash_operations enable row level security;
create policy "cash_ops_select" on cash_operations for select to anon, authenticated using (true);
create policy "cash_ops_insert" on cash_operations for insert to anon, authenticated with check (true);
create policy "cash_ops_delete" on cash_operations for delete to anon, authenticated using (true);

-- ==============================
-- Storage: menu images bucket
-- ==============================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('client-photos', 'client-photos', true)
on conflict (id) do nothing;

-- ==============================
-- Discounts
-- ==============================
create type discount_type as enum ('percentage', 'fixed');
create type discount_target as enum ('check', 'item');

create table discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type discount_type not null,
  value numeric not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table check_discounts (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  discount_id uuid references discounts(id),
  target discount_target not null default 'check',
  item_id uuid references check_items(id) on delete cascade,
  discount_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table checks add column discount_total numeric not null default 0;

alter table discounts enable row level security;
alter table check_discounts enable row level security;
create policy "discounts_all" on discounts for all to anon, authenticated using (true) with check (true);
create policy "check_discounts_all" on check_discounts for all to anon, authenticated using (true) with check (true);

-- ==============================
-- Spaces & Bookings
-- ==============================
create type space_type as enum ('cabin_small', 'cabin_big', 'hall');
create type booking_status as enum ('booked', 'active', 'completed', 'cancelled');

create table spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type space_type not null,
  hourly_rate numeric,
  is_active boolean not null default true
);

alter table checks add column space_id uuid references spaces(id);

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

insert into spaces (name, type, hourly_rate) values
  ('Маленькая кабинка', 'cabin_small', 250),
  ('Большая кабинка', 'cabin_big', 500),
  ('Зал', 'hall', null);

alter table spaces enable row level security;
alter table bookings enable row level security;
create policy "spaces_all" on spaces for all to anon, authenticated using (true) with check (true);
create policy "bookings_all" on bookings for all to anon, authenticated using (true) with check (true);

-- ==============================
-- Events (offsite)
-- ==============================
create type event_status as enum ('planned', 'completed', 'cancelled');

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  amount numeric not null default 0,
  note text,
  status event_status not null default 'planned',
  check_id uuid references checks(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table events enable row level security;
create policy "events_all" on events for all to anon, authenticated using (true) with check (true);

-- ==============================
-- Split Payments
-- ==============================
create table check_payments (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  method payment_method not null,
  amount numeric not null default 0
);

alter table check_payments enable row level security;
create policy "check_payments_all" on check_payments for all to anon, authenticated using (true) with check (true);

-- ==============================
-- Realtime
-- ==============================
alter publication supabase_realtime add table checks, check_items, inventory, shifts, cash_operations, bookings;
alter table checks replica identity full;
alter table check_items replica identity full;
alter table inventory replica identity full;
alter table shifts replica identity full;
alter table cash_operations replica identity full;
alter table bookings replica identity full;
