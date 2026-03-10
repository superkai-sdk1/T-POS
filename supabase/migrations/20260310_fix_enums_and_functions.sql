-- Fix payment_method enum: add 'split' value used by POS split payments
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'split';

-- Fix transaction_type enum: add 'refund' value used by RefundsManager
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'refund';

-- Fix decrement_stock: change p_qty from int to numeric to match inventory.stock_quantity type
CREATE OR REPLACE FUNCTION decrement_stock(p_item_id uuid, p_qty numeric)
RETURNS void AS $$
BEGIN
  UPDATE inventory
  SET stock_quantity = GREATEST(0, stock_quantity - p_qty)
  WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql;

-- Fix realtime: add menu_categories to publication (used by useRealtimeSync)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'menu_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE menu_categories;
  END IF;
END $$;
ALTER TABLE menu_categories REPLICA IDENTITY FULL;

-- Fix realtime: re-add events to publication after DROP TABLE in 20260306 migration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
  END IF;
END $$;
ALTER TABLE events REPLICA IDENTITY FULL;
