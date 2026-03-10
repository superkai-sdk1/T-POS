-- Allow deleting inventory items (RLS had no DELETE policy)
CREATE POLICY "inventory_delete" ON inventory
  FOR DELETE TO anon, authenticated
  USING (true);
