-- Allow inventory.category to store any menu_categories slug (not just enum values).
-- This enables custom subcategories and moving items between sections.
ALTER TABLE inventory
  ALTER COLUMN category TYPE text USING category::text;
