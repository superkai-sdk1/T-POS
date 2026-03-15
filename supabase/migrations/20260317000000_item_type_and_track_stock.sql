-- Разделяем тип позиции (товар/услуга) и учёт остатков
-- Услуги: всегда без остатков, тумблер не нужен
-- Товары: можно включить/выключить учёт остатков

alter table inventory
  add column is_service boolean not null default false;

-- Миграция: track_stock=false → услуга, track_stock=true → товар
update inventory set is_service = true where track_stock = false;

-- Для услуг track_stock всегда false
-- Для товаров track_stock может быть true или false
-- (уже корректно после миграции)
