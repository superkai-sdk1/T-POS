-- Tablet Orders and Visibility Integration

-- 1. Visibility flags for Client Tablet
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_tablet_visible BOOLEAN DEFAULT true;
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS is_tablet_visible BOOLEAN DEFAULT true;

-- 1.5 Add tablet to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'tablet';

-- 2. Link profile to a space (for Tablet auth roles)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linked_space_id UUID REFERENCES spaces(id) ON DELETE SET NULL;

-- 3. Tablet Orders Table
CREATE TABLE IF NOT EXISTS tablet_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected
  comment TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Tablet Order Items
CREATE TABLE IF NOT EXISTS tablet_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES tablet_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL CHECK (quantity > 0)
);

-- RLS Settings
ALTER TABLE tablet_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tablet_order_items ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies if they exist (idempotent run)
DROP POLICY IF EXISTS "Tablets can view their own orders" ON tablet_orders;
DROP POLICY IF EXISTS "Tablets can insert orders" ON tablet_orders;
DROP POLICY IF EXISTS "Staff can update orders" ON tablet_orders;
DROP POLICY IF EXISTS "Tablets can view items from their orders" ON tablet_order_items;
DROP POLICY IF EXISTS "Tablets can insert items" ON tablet_order_items;

-- Allow tablets to insert their own orders and read them
CREATE POLICY "Tablets can view their own orders" ON tablet_orders
  FOR SELECT USING (auth.uid() = profile_id OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'staff')));

CREATE POLICY "Tablets can insert orders" ON tablet_orders
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Staff can update orders" ON tablet_orders
  FOR UPDATE USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'staff')));

-- Items policies
CREATE POLICY "Tablets can view items from their orders" ON tablet_order_items
  FOR SELECT USING (order_id IN (SELECT id FROM tablet_orders WHERE profile_id = auth.uid()) OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'staff')));

CREATE POLICY "Tablets can insert items" ON tablet_order_items
  FOR INSERT WITH CHECK (order_id IN (SELECT id FROM tablet_orders WHERE profile_id = auth.uid()));

-- Realtime publication for orders (safe to ignore if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'tablet_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tablet_orders;
  END IF;
END $$;
