-- ==============================
-- Client discount rules: automatic discounts for specific clients on specific items
-- User selects: client, item, discount amount (type + value). Discount applied when item added.
-- ==============================
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS is_auto boolean not null default false;

CREATE TABLE IF NOT EXISTS client_discount_rules (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references discounts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references inventory(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(profile_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_client_discount_rules_discount ON client_discount_rules(discount_id);
CREATE INDEX IF NOT EXISTS idx_client_discount_rules_profile ON client_discount_rules(profile_id);
CREATE INDEX IF NOT EXISTS idx_client_discount_rules_item ON client_discount_rules(item_id);

ALTER TABLE client_discount_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_discount_rules_all" ON client_discount_rules;
CREATE POLICY "client_discount_rules_all" ON client_discount_rules FOR ALL USING (true) WITH CHECK (true);

-- Link check_discounts to client_discount_rules for proper removal
ALTER TABLE check_discounts ADD COLUMN IF NOT EXISTS client_rule_id uuid references client_discount_rules(id) on delete set null;

-- Realtime for client_discount_rules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'client_discount_rules') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE client_discount_rules;
  END IF;
END $$;
ALTER TABLE client_discount_rules REPLICA IDENTITY FULL;
