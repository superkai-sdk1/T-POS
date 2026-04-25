-- ============================================================
-- Fix: Пересчёт сумм закрытых чеков (total_amount = 0, но позиции есть)
-- Выполни в Supabase SQL Editor → New query → Run
-- ============================================================

-- 1. Пересчитать checks.total_amount и checks.discount_total
WITH check_totals AS (
  SELECT
    c.id,
    COALESCE(SUM(ci.price_at_time * ci.quantity), 0) AS items_total,
    COALESCE(SUM(cd.discount_amount), 0) AS discounts_total
  FROM checks c
  LEFT JOIN check_items ci ON ci.check_id = c.id
  LEFT JOIN check_discounts cd ON cd.check_id = c.id
  WHERE c.status = 'closed'
  GROUP BY c.id
)
UPDATE checks
SET
  total_amount = GREATEST(0, ct.items_total - ct.discounts_total),
  discount_total = ct.discounts_total
FROM check_totals ct
WHERE checks.id = ct.id
  AND (checks.total_amount IS DISTINCT FROM GREATEST(0, ct.items_total - ct.discounts_total)
       OR checks.discount_total IS DISTINCT FROM ct.discounts_total);

-- 2. Исправить transactions 'sale' (закрытие чека) с amount = 0
WITH check_totals AS (
  SELECT
    c.id,
    GREATEST(0,
      COALESCE(SUM(ci.price_at_time * ci.quantity), 0)
      - COALESCE(SUM(cd.discount_amount), 0)
    ) AS correct_total
  FROM checks c
  LEFT JOIN check_items ci ON ci.check_id = c.id
  LEFT JOIN check_discounts cd ON cd.check_id = c.id
  WHERE c.status = 'closed'
  GROUP BY c.id
  HAVING GREATEST(0,
    COALESCE(SUM(ci.price_at_time * ci.quantity), 0)
    - COALESCE(SUM(cd.discount_amount), 0)
  ) > 0
)
UPDATE transactions
SET amount = ct.correct_total
FROM check_totals ct
WHERE transactions.check_id = ct.id
  AND transactions.type = 'sale'
  AND transactions.amount = 0;

-- ============================================================
-- 3. (ОПЦИОНАЛЬНО) Исправление бонусных начислений
-- Если у тебя включена бонусная система и клиенты жалуются,
-- что им не начислились бонусы за старые чеки — раскомментируй
-- блок ниже и поменяй rate (по умолчанию 10%).
--
-- ⚠️ Перед запуском проверь: SELECT value FROM app_settings WHERE key = 'bonus_accrual_rate';
-- ============================================================

/*
WITH check_totals AS (
  SELECT
    c.id AS check_id,
    c.player_id,
    GREATEST(0,
      COALESCE(SUM(ci.price_at_time * ci.quantity), 0)
      - COALESCE(SUM(cd.discount_amount), 0)
    ) AS correct_total
  FROM checks c
  LEFT JOIN check_items ci ON ci.check_id = c.id
  LEFT JOIN check_discounts cd ON cd.check_id = c.id
  WHERE c.status = 'closed'
    AND c.player_id IS NOT NULL
  GROUP BY c.id, c.player_id
  HAVING GREATEST(0,
    COALESCE(SUM(ci.price_at_time * ci.quantity), 0)
    - COALESCE(SUM(cd.discount_amount), 0)
  ) > 0
),
bonus_fix AS (
  SELECT
    check_id,
    player_id,
    correct_total,
    ROUND(correct_total * 0.1) AS correct_bonus   -- ← поменяй 0.1 на свой rate
  FROM check_totals
)
-- Обновить bonus_accrual в transactions
UPDATE transactions
SET
  amount = bf.correct_bonus,
  description = 'Начисление бонусов (10% от ' || bf.correct_total || '₽)'
FROM bonus_fix bf
WHERE transactions.check_id = bf.check_id
  AND transactions.type = 'bonus_accrual'
  AND transactions.amount = 0;

-- Пересчитать balance_after в bonus_history для всех записей
-- (делаем последовательный пересчёт по created_at)
WITH ordered_bh AS (
  SELECT
    id,
    profile_id,
    amount,
    SUM(amount) OVER (PARTITION BY profile_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
  FROM bonus_history
)
UPDATE bonus_history
SET balance_after = ob.running_total
FROM ordered_bh ob
WHERE bonus_history.id = ob.id;

-- Пересчитать profiles.bonus_points из bonus_history
UPDATE profiles
SET bonus_points = COALESCE(bh.total, 0)
FROM (
  SELECT profile_id, SUM(amount) AS total
  FROM bonus_history
  GROUP BY profile_id
) bh
WHERE profiles.id = bh.profile_id;
*/
