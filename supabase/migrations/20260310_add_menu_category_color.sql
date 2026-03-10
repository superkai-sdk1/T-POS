-- Add color column to menu_categories for POS menu color coding
alter table menu_categories add column if not exists color text default 'slate';
