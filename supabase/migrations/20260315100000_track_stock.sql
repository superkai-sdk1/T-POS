-- Add track_stock to distinguish products (with quantity) from services (no stock tracking)
alter table inventory
  add column track_stock boolean not null default true;

-- Category 'services' = услуги (игровые вечера, аренда, мероприятия) — без учёта остатков
update inventory set track_stock = false where category = 'services';

-- Update stock functions to skip items with track_stock = false
create or replace function decrement_stock(p_item_id uuid, p_qty numeric)
returns void as $$
begin
  update inventory
  set stock_quantity = stock_quantity - p_qty
  where id = p_item_id and track_stock = true;
end;
$$ language plpgsql;

create or replace function increment_stock(p_item_id uuid, p_qty numeric)
returns void as $$
begin
  update inventory set stock_quantity = stock_quantity + p_qty where id = p_item_id and track_stock = true;
end;
$$ language plpgsql;
