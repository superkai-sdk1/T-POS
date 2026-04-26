-- T-POS Database Schema
-- PostgreSQL schema for local deployment

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'client',
  password_hash TEXT,
  pin TEXT,
  balance DECIMAL(10, 2) DEFAULT 0,
  bonus_points INTEGER DEFAULT 0,
  client_tier VARCHAR(50) DEFAULT 'bronze',
  is_resident BOOLEAN DEFAULT false,
  photo_url TEXT,
  tg_id BIGINT UNIQUE,
  tg_username VARCHAR(255),
  phone VARCHAR(20),
  birthday DATE,
  linked_space_id UUID,
  permissions JSONB DEFAULT '[]'::jsonb,
  search_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  price DECIMAL(10, 2) NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Checks table
CREATE TABLE IF NOT EXISTS checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  staff_id UUID REFERENCES profiles(id),
  shift_id UUID,
  status VARCHAR(50) DEFAULT 'open',
  total DECIMAL(10, 2) DEFAULT 0,
  discount_total DECIMAL(10, 2) DEFAULT 0,
  bonus_used INTEGER DEFAULT 0,
  space_rental DECIMAL(10, 2) DEFAULT 0,
  certificate_used BOOLEAN DEFAULT false,
  certificate_id UUID,
  closed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Check Items table
CREATE TABLE IF NOT EXISTS check_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES checks(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id),
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  quantity INTEGER NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Check Payments table
CREATE TABLE IF NOT EXISTS check_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES checks(id) ON DELETE CASCADE,
  payment_method VARCHAR(50) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  check_id UUID REFERENCES checks(id),
  item_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES profiles(id),
  opened_by UUID REFERENCES profiles(id),
  closed_by UUID REFERENCES profiles(id),
  status VARCHAR(50) DEFAULT 'open',
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  total_checks INTEGER DEFAULT 0,
  total_revenue DECIMAL(10, 2) DEFAULT 0
);

-- Discounts table
CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  value DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  min_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  location TEXT,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  status VARCHAR(50) DEFAULT 'planned',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spaces table
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  hourly_rate DECIMAL(10, 2),
  capacity INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES spaces(id),
  player_id UUID REFERENCES profiles(id),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supplies table
CREATE TABLE IF NOT EXISTS supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit VARCHAR(50),
  supplier VARCHAR(255),
  note TEXT,
  total_cost DECIMAL(10, 2),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bonus History table
CREATE TABLE IF NOT EXISTS bonus_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  amount DECIMAL(10, 2),
  points INTEGER,
  balance_after DECIMAL(10, 2),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50),
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- App Settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TG Link Requests table
CREATE TABLE IF NOT EXISTS tg_link_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id BIGINT NOT NULL,
  tg_username VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_tg_id ON profiles(tg_id);
CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON profiles(nickname);
CREATE INDEX IF NOT EXISTS idx_checks_player_id ON checks(player_id);
CREATE INDEX IF NOT EXISTS idx_checks_staff_id ON checks(staff_id);
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);
CREATE INDEX IF NOT EXISTS idx_checks_created_at ON checks(created_at);
CREATE INDEX IF NOT EXISTS idx_check_items_check_id ON check_items(check_id);
CREATE INDEX IF NOT EXISTS idx_check_payments_check_id ON check_payments(check_id);
CREATE INDEX IF NOT EXISTS idx_transactions_player_id ON transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_bookings_space_id ON bookings(space_id);
CREATE INDEX IF NOT EXISTS idx_bookings_player_id ON bookings(player_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
