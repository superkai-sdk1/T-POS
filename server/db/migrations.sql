-- T-POS Migrations (безопасно применять к существующей БД)
-- Только CREATE TABLE IF NOT EXISTS — никаких DROP!

-- Исправление типа app_settings.value (BIGINT → TEXT)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='app_settings' AND column_name='value' AND data_type='bigint'
  ) THEN
    ALTER TABLE app_settings ALTER COLUMN value TYPE TEXT USING value::TEXT;
  END IF;
END $$;

-- Добавление PRIMARY KEY на app_settings если нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='app_settings' AND constraint_type='PRIMARY KEY'
  ) THEN
    ALTER TABLE app_settings ADD PRIMARY KEY (key);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  amount NUMERIC,
  description TEXT,
  expense_date DATE DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID,
  total_amount NUMERIC,
  refund_type TEXT,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID,
  amount NUMERIC,
  payment_method TEXT,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID,
  item_id UUID,
  quantity INTEGER,
  cost_per_unit NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  nominal NUMERIC,
  balance NUMERIC,
  is_used BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT,
  amount NUMERIC,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  types JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tg_link_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID,
  tg_id TEXT,
  tg_username TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Добавляем updated_at в profiles если нет
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
