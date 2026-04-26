-- T-POS Database Schema
-- Generated from Supabase export

-- profiles
DROP TABLE IF EXISTS profiles CASCADE;
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  nickname TEXT,
  is_resident BOOLEAN,
  balance INTEGER,
  bonus_points INTEGER,
  tg_id TEXT,
  role TEXT,
  password_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  phone TEXT,
  photo_url TEXT,
  birthday DATE,
  pin TEXT,
  client_tier TEXT,
  tg_username TEXT,
  deleted_at TEXT,
  search_tags TEXT[],
  permissions TEXT,
  linked_space_id TEXT
);

-- inventory
DROP TABLE IF EXISTS inventory CASCADE;
CREATE TABLE inventory (
  id UUID PRIMARY KEY,
  name TEXT,
  category TEXT,
  price INTEGER,
  stock_quantity INTEGER,
  min_threshold INTEGER,
  is_active BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  image_url TEXT,
  sort_order INTEGER,
  search_tags TEXT[],
  is_top BOOLEAN,
  track_stock BOOLEAN,
  is_service BOOLEAN,
  linked_space_id TEXT,
  is_tablet_visible BOOLEAN
);

-- checks
DROP TABLE IF EXISTS checks CASCADE;
CREATE TABLE checks (
  id UUID PRIMARY KEY,
  player_id UUID,
  staff_id UUID,
  status TEXT,
  total_amount INTEGER,
  payment_method TEXT,
  bonus_used INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  shift_id UUID,
  note TEXT,
  discount_total INTEGER,
  space_id TEXT,
  guest_names TEXT,
  certificate_used INTEGER,
  certificate_id TEXT,
  space_start_at TEXT,
  space_end_at TEXT
);

-- check_items
DROP TABLE IF EXISTS check_items CASCADE;
CREATE TABLE check_items (
  id UUID PRIMARY KEY,
  check_id UUID,
  item_id UUID,
  quantity INTEGER,
  price_at_time INTEGER
);

-- check_payments
DROP TABLE IF EXISTS check_payments CASCADE;
CREATE TABLE check_payments (
  id UUID PRIMARY KEY,
  check_id UUID,
  method TEXT,
  amount INTEGER
);

-- transactions
DROP TABLE IF EXISTS transactions CASCADE;
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  type TEXT,
  amount INTEGER,
  description TEXT,
  item_id UUID,
  check_id TEXT,
  player_id TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE
);

-- shifts
DROP TABLE IF EXISTS shifts CASCADE;
CREATE TABLE shifts (
  id UUID PRIMARY KEY,
  opened_by UUID,
  closed_by UUID,
  status TEXT,
  cash_start INTEGER,
  cash_end INTEGER,
  note TEXT,
  opened_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  evening_type TEXT
);

-- discounts
DROP TABLE IF EXISTS discounts CASCADE;
CREATE TABLE discounts (
  id UUID PRIMARY KEY,
  name TEXT,
  type TEXT,
  value INTEGER,
  is_active BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  min_quantity TEXT,
  item_id TEXT,
  is_auto BOOLEAN
);

-- events
DROP TABLE IF EXISTS events CASCADE;
CREATE TABLE events (
  id UUID PRIMARY KEY,
  type TEXT,
  location TEXT,
  date DATE,
  start_time TEXT,
  end_time TEXT,
  payment_type TEXT,
  fixed_amount INTEGER,
  status TEXT,
  comment TEXT,
  reminders TEXT[],
  check_id TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- spaces
DROP TABLE IF EXISTS spaces CASCADE;
CREATE TABLE spaces (
  id UUID PRIMARY KEY,
  name TEXT,
  type TEXT,
  hourly_rate TEXT,
  is_active BOOLEAN
);

-- supplies
DROP TABLE IF EXISTS supplies CASCADE;
CREATE TABLE supplies (
  id UUID PRIMARY KEY,
  note TEXT,
  total_cost INTEGER,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  payment_method TEXT
);

-- bonus_history
DROP TABLE IF EXISTS bonus_history CASCADE;
CREATE TABLE bonus_history (
  id UUID PRIMARY KEY,
  profile_id UUID,
  amount INTEGER,
  balance_after INTEGER,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE
);

-- notifications
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  type TEXT,
  title TEXT,
  body TEXT,
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE
);

-- app_settings
DROP TABLE IF EXISTS app_settings CASCADE;
CREATE TABLE app_settings (
  key TEXT,
  value BIGINT,
  updated_at TIMESTAMP WITH TIME ZONE
);

