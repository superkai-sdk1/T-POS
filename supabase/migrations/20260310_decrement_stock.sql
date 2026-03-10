CREATE OR REPLACE FUNCTION decrement_stock(p_item_id uuid, p_qty numeric)
RETURNS void AS $$
BEGIN
  UPDATE inventory
  SET stock_quantity = GREATEST(0, stock_quantity - p_qty)
  WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql;
