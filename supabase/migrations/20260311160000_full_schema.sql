-- ============================================
-- TPOS: Full schema migration (all SQL consolidated)
-- Sources: migration.sql, consolidated, add_deposit, add_search_tags, missing_schema
-- ============================================

-- 1. Events table
DROP TABLE IF EXISTS public.events CASCADE;
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('titan', 'exit')),
    location TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIME NOT NULL,
    end_time TIME,
    payment_type TEXT NOT NULL DEFAULT 'fixed' CHECK (payment_type IN ('fixed', 'hourly')),
    fixed_amount NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
    comment TEXT,
    reminders JSONB DEFAULT '[]'::JSONB,
    check_id UUID REFERENCES public.checks(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.events;
CREATE POLICY "Enable all access" ON public.events FOR ALL USING (true);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. Menu category color
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS color text DEFAULT 'slate';

-- 3. decrement_stock function
CREATE OR REPLACE FUNCTION decrement_stock(p_item_id uuid, p_qty numeric)
RETURNS void AS $$
BEGIN
  UPDATE inventory SET stock_quantity = GREATEST(0, stock_quantity - p_qty) WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Enum fixes
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'split';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'deposit';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'refund';

-- 5. Realtime: menu_categories, events
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'menu_categories') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE menu_categories;
  END IF;
END $$;
ALTER TABLE menu_categories REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
  END IF;
END $$;
ALTER TABLE events REPLICA IDENTITY FULL;

-- 6. Inventory: category as text, search_tags, is_top
ALTER TABLE inventory ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS search_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_top boolean NOT NULL DEFAULT false;

-- 7. Menu category icons and colors
UPDATE menu_categories SET icon_name = 'GlassWater', color = 'blue' WHERE slug = 'drinks';
UPDATE menu_categories SET icon_name = 'Zap', color = 'amber' WHERE slug IN ('energy', 'energetiki', 'энергетики');
UPDATE menu_categories SET icon_name = 'Martini', color = 'rose' WHERE slug IN ('alcohol', 'alkogol', 'алкоголь');
UPDATE menu_categories SET icon_name = 'Coffee', color = 'emerald' WHERE slug IN ('tea_coffee', 'chai_kofe', 'чай_кофе', 'tea', 'coffee');
UPDATE menu_categories SET icon_name = 'UtensilsCrossed', color = 'orange' WHERE slug = 'food';
UPDATE menu_categories SET icon_name = 'Cookie', color = 'amber' WHERE slug IN ('bar', 'snacks', 'снеки', 'sneki');
UPDATE menu_categories SET icon_name = 'Wind', color = 'violet' WHERE slug = 'hookah';
UPDATE menu_categories SET icon_name = 'Timer', color = 'indigo' WHERE slug IN ('services', 'tariffs', 'тарифы', 'tarify');

-- 8. Inventory delete policy
DROP POLICY IF EXISTS "inventory_delete" ON inventory;
CREATE POLICY "inventory_delete" ON inventory FOR DELETE TO anon, authenticated USING (true);

-- 9. cash_operations: shift_open, shift_close
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cash_operations'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%inkassation%'
  LOOP
    EXECUTE format('ALTER TABLE cash_operations DROP CONSTRAINT %I', r.conname);
    EXIT;
  END LOOP;
  ALTER TABLE cash_operations ADD CONSTRAINT cash_operations_type_check
    CHECK (type IN ('inkassation', 'deposit', 'shift_open', 'shift_close'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. certificates.used_at
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS used_at timestamptz;

-- 11. tg_link_requests
CREATE TABLE IF NOT EXISTS tg_link_requests (
  id uuid primary key default gen_random_uuid(),
  tg_id text not null,
  tg_username text,
  tg_first_name text,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_tg_link_requests_status ON tg_link_requests(status);
ALTER TABLE tg_link_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tg_link_requests_all" ON tg_link_requests;
CREATE POLICY "tg_link_requests_all" ON tg_link_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tg_link_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tg_link_requests;
  END IF;
END $$;
ALTER TABLE tg_link_requests REPLICA IDENTITY FULL;

-- 12. refunds, refund_items
CREATE TABLE IF NOT EXISTS refunds (
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
CREATE TABLE IF NOT EXISTS refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references refunds(id) on delete cascade,
  item_id uuid not null references inventory(id),
  quantity numeric not null default 1,
  price_at_time numeric not null default 0
);
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "refunds_all" ON refunds;
CREATE POLICY "refunds_all" ON refunds FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "refund_items_all" ON refund_items;
CREATE POLICY "refund_items_all" ON refund_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'refunds') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE refunds;
  END IF;
END $$;
ALTER TABLE refunds REPLICA IDENTITY FULL;

-- 13. Storage: client-photos bucket and policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN
  CREATE POLICY "client_photos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "client_photos_insert_anon" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "client_photos_select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "client_photos_update" ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "client_photos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "client_photos_delete_anon" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
