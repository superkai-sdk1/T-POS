-- Add search tags and "top" flag to inventory items
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS search_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_top boolean NOT NULL DEFAULT false;
