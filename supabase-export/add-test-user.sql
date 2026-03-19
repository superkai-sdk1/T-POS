-- Добавить тестового владельца, если profiles пустая
-- Выполните в Supabase Dashboard → SQL Editor

-- 1. Проверка: сколько записей в profiles
-- SELECT count(*) FROM profiles;

-- 2. Добавить Kai (owner): логин Kai, пароль titan2024, PIN 0780
-- Выполняется только если нет ни одного owner/staff
INSERT INTO profiles (nickname, is_resident, balance, bonus_points, tg_id, role, password_hash, pin)
SELECT 'Kai', true, 0, 0, '1005574994', 'owner', 'titan2024', '0780'
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE role IN ('owner', 'staff'));
