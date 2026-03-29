-- Atomic close_check function (v1.3)
-- Wraps all check-closing operations in a single transaction:
--   1. Update check status
--   2. Insert payments
--   3. Update player balance/bonus
--   4. Insert transactions (sale, bonus_spend, bonus_accrual, debt_adjustment)
--   5. Insert bonus_history
--   6. Decrement stock
--   7. Complete bookings/events

CREATE OR REPLACE FUNCTION close_check(
  p_check_id UUID,
  p_payments JSONB DEFAULT '[]'::jsonb,
  p_bonus_used INT DEFAULT 0,
  p_space_rental INT DEFAULT 0,
  p_certificate_used INT DEFAULT 0,
  p_certificate_id UUID DEFAULT NULL,
  p_discount_total INT DEFAULT 0,
  p_closed_by UUID DEFAULT NULL,
  p_cart_items JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_check RECORD;
  v_player RECORD;
  v_payment RECORD;
  v_cart RECORD;
  v_total INT;
  v_final_amount INT;
  v_event_amount INT := 0;
  v_primary_method TEXT;
  v_is_split BOOLEAN;
  v_debt_amount INT := 0;
  v_deposit_amount INT := 0;
  v_new_balance INT;
  v_bonus_accrual INT := 0;
  v_bonus_rate INT := 10;
  v_bonus_min INT := 0;
  v_bonus_enabled BOOLEAN := TRUE;
  v_bonus_on_debt BOOLEAN := FALSE;
  v_has_non_debt BOOLEAN := FALSE;
  v_new_points INT;
  v_cfg_val TEXT;
  v_method_desc TEXT;
BEGIN
  -- 1. Lock and validate check
  SELECT * INTO v_check FROM checks WHERE id = p_check_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Check not found');
  END IF;
  
  IF v_check.status != 'open' THEN
    RETURN jsonb_build_object('error', 'Check is not open (status: ' || v_check.status || ')');
  END IF;

  -- 2. Calculate total
  v_total := COALESCE(v_check.total_amount, 0) + p_space_rental;
  
  -- Check for linked event
  SELECT COALESCE(fixed_amount, 0) INTO v_event_amount
    FROM events WHERE check_id = p_check_id LIMIT 1;
  IF FOUND THEN
    v_total := v_total + v_event_amount;
  END IF;

  v_final_amount := GREATEST(0, v_total - p_bonus_used - p_certificate_used);

  -- Determine payment method
  v_is_split := jsonb_array_length(p_payments) > 1;
  IF jsonb_array_length(p_payments) = 0 THEN
    v_primary_method := 'cash';
  ELSIF v_is_split THEN
    v_primary_method := 'split';
  ELSE
    v_primary_method := p_payments->0->>'method';
  END IF;

  -- 3. Update check status
  UPDATE checks SET
    status = 'closed',
    total_amount = v_final_amount,
    payment_method = v_primary_method,
    bonus_used = p_bonus_used,
    certificate_used = p_certificate_used,
    certificate_id = p_certificate_id,
    discount_total = p_discount_total,
    closed_at = NOW()
  WHERE id = p_check_id;

  -- 4. Insert payments
  IF jsonb_array_length(p_payments) > 0 THEN
    INSERT INTO check_payments (check_id, method, amount)
    SELECT p_check_id, (elem->>'method')::TEXT, (elem->>'amount')::INT
    FROM jsonb_array_elements(p_payments) AS elem;
  END IF;

  -- 5. Player balance/bonus updates
  IF v_check.player_id IS NOT NULL THEN
    SELECT balance, bonus_points INTO v_player
      FROM profiles WHERE id = v_check.player_id FOR UPDATE;

    IF FOUND THEN
      -- Sum debt and deposit payments
      SELECT
        COALESCE(SUM(CASE WHEN (elem->>'method') = 'debt' THEN (elem->>'amount')::INT ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN (elem->>'method') = 'deposit' THEN (elem->>'amount')::INT ELSE 0 END), 0),
        bool_or((elem->>'method') != 'debt')
      INTO v_debt_amount, v_deposit_amount, v_has_non_debt
      FROM jsonb_array_elements(p_payments) AS elem;

      -- Load bonus settings
      SELECT value INTO v_cfg_val FROM app_settings WHERE key = 'bonus_enabled';
      IF v_cfg_val = 'false' THEN v_bonus_enabled := FALSE; END IF;

      SELECT value INTO v_cfg_val FROM app_settings WHERE key = 'bonus_accrual_rate';
      IF v_cfg_val IS NOT NULL THEN v_bonus_rate := v_cfg_val::INT; END IF;

      SELECT value INTO v_cfg_val FROM app_settings WHERE key = 'bonus_min_purchase';
      IF v_cfg_val IS NOT NULL THEN v_bonus_min := v_cfg_val::INT; END IF;

      SELECT value INTO v_cfg_val FROM app_settings WHERE key = 'bonus_accrual_on_debt';
      IF v_cfg_val = 'true' THEN v_bonus_on_debt := TRUE; END IF;

      -- Calculate bonus accrual
      IF v_bonus_enabled AND v_total >= v_bonus_min AND (v_has_non_debt OR v_bonus_on_debt) THEN
        v_bonus_accrual := ROUND(v_total * v_bonus_rate / 100.0);
      END IF;

      -- Update player balance
      v_new_balance := v_player.balance;
      IF v_debt_amount > 0 THEN
        v_new_balance := v_new_balance - v_debt_amount;
      END IF;
      IF v_deposit_amount > 0 THEN
        v_new_balance := v_new_balance - v_deposit_amount;
      END IF;

      v_new_points := GREATEST(0, v_player.bonus_points - p_bonus_used) + v_bonus_accrual;

      UPDATE profiles SET
        balance = v_new_balance,
        bonus_points = v_new_points
      WHERE id = v_check.player_id;

      -- Insert bonus transactions
      IF p_bonus_used > 0 THEN
        INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
        VALUES ('bonus_spend', p_bonus_used, 'Списание бонусов по чеку', p_check_id, v_check.player_id, p_closed_by);

        INSERT INTO bonus_history (profile_id, amount, balance_after, reason)
        VALUES (v_check.player_id, -p_bonus_used, GREATEST(0, v_player.bonus_points - p_bonus_used), 'Списание по чеку');
      END IF;

      IF v_bonus_accrual > 0 THEN
        INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
        VALUES ('bonus_accrual', v_bonus_accrual,
                'Начисление бонусов (' || v_bonus_rate || '% от ' || v_total || '₽)',
                p_check_id, v_check.player_id, p_closed_by);

        INSERT INTO bonus_history (profile_id, amount, balance_after, reason)
        VALUES (v_check.player_id, v_bonus_accrual, v_new_points,
                'Начисление ' || v_bonus_rate || '% от ' || v_total || '₽');
      END IF;

      IF v_deposit_amount > 0 THEN
        INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
        VALUES ('debt_adjustment', -v_deposit_amount,
                'Оплата с депозита по чеку (было ' || v_player.balance || '₽, стало ' || v_new_balance || '₽)',
                p_check_id, v_check.player_id, p_closed_by);
      END IF;
    END IF;
  END IF;

  -- 6. Sale transaction
  v_method_desc := CASE
    WHEN p_certificate_used > 0 AND jsonb_array_length(p_payments) > 0 THEN
      'сертификат + ' || CASE WHEN v_is_split THEN 'разд. оплата' ELSE COALESCE(v_primary_method, 'cash') END
    WHEN p_certificate_used > 0 THEN 'сертификат'
    WHEN v_is_split THEN 'разд. оплата'
    ELSE COALESCE(v_primary_method, 'cash')
  END;

  INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
  VALUES ('sale', v_final_amount, 'Закрытие чека (' || v_method_desc || ')',
          p_check_id, v_check.player_id, p_closed_by);

  IF p_certificate_used > 0 THEN
    INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
    VALUES ('sale', 0,
            'Оплата сертификатом: ' || p_certificate_used || '₽' ||
              CASE WHEN p_certificate_id IS NOT NULL THEN ' (' || LEFT(p_certificate_id::TEXT, 8) || ')' ELSE '' END,
            p_check_id, v_check.player_id, p_closed_by);
  END IF;

  -- 7. Decrement stock
  FOR v_cart IN SELECT * FROM jsonb_array_elements(p_cart_items) LOOP
    PERFORM decrement_stock(
      (v_cart.value->>'item_id')::UUID,
      (v_cart.value->>'quantity')::NUMERIC
    );
  END LOOP;

  -- 8. Complete bookings & events
  IF v_check.space_id IS NOT NULL THEN
    UPDATE bookings SET status = 'completed'
    WHERE check_id = p_check_id AND status = 'active';
  END IF;

  UPDATE events SET status = 'completed'
  WHERE check_id = p_check_id AND status != 'completed';

  -- Return result
  RETURN jsonb_build_object(
    'success', TRUE,
    'final_amount', v_final_amount,
    'bonus_accrual', v_bonus_accrual,
    'method', v_primary_method
  );
END;
$$ LANGUAGE plpgsql;
