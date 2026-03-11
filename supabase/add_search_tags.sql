-- ============================================
-- Одноразовый скрипт: заполнение search_tags для профилей (транслитерация)
-- Схема (storage policies) — в migrations/20260311160000_full_schema.sql
-- Supabase Dashboard → SQL Editor → Run
-- ============================================

-- 1. Добавить колонку search_tags
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_tags text[] NOT NULL DEFAULT '{}';

-- 2. Функции транслитерации (временные, удалятся в конце)

CREATE OR REPLACE FUNCTION _tmp_en_to_ru(input text) RETURNS text AS $$
DECLARE r text := input;
BEGIN
  r:=replace(r,'shch','щ'); r:=replace(r,'Shch','Щ');
  r:=replace(r,'sh','ш'); r:=replace(r,'Sh','Ш'); r:=replace(r,'SH','Ш');
  r:=replace(r,'ch','ч'); r:=replace(r,'Ch','Ч'); r:=replace(r,'CH','Ч');
  r:=replace(r,'zh','ж'); r:=replace(r,'Zh','Ж'); r:=replace(r,'ZH','Ж');
  r:=replace(r,'ts','ц'); r:=replace(r,'Ts','Ц');
  r:=replace(r,'ya','я'); r:=replace(r,'Ya','Я');
  r:=replace(r,'yu','ю'); r:=replace(r,'Yu','Ю');
  r:=replace(r,'yo','ё'); r:=replace(r,'Yo','Ё');
  r:=replace(r,'ey','ей'); r:=replace(r,'iy','ий');
  r:=replace(r,'a','а'); r:=replace(r,'b','б'); r:=replace(r,'v','в');
  r:=replace(r,'g','г'); r:=replace(r,'d','д'); r:=replace(r,'e','е');
  r:=replace(r,'z','з'); r:=replace(r,'i','и'); r:=replace(r,'k','к');
  r:=replace(r,'l','л'); r:=replace(r,'m','м'); r:=replace(r,'n','н');
  r:=replace(r,'o','о'); r:=replace(r,'p','п'); r:=replace(r,'r','р');
  r:=replace(r,'s','с'); r:=replace(r,'t','т'); r:=replace(r,'u','у');
  r:=replace(r,'f','ф'); r:=replace(r,'h','х'); r:=replace(r,'c','к');
  r:=replace(r,'w','в'); r:=replace(r,'x','кс'); r:=replace(r,'y','й');
  r:=replace(r,'j','дж');
  r:=replace(r,'A','А'); r:=replace(r,'B','Б'); r:=replace(r,'V','В');
  r:=replace(r,'G','Г'); r:=replace(r,'D','Д'); r:=replace(r,'E','Е');
  r:=replace(r,'Z','З'); r:=replace(r,'I','И'); r:=replace(r,'K','К');
  r:=replace(r,'L','Л'); r:=replace(r,'M','М'); r:=replace(r,'N','Н');
  r:=replace(r,'O','О'); r:=replace(r,'P','П'); r:=replace(r,'R','Р');
  r:=replace(r,'S','С'); r:=replace(r,'T','Т'); r:=replace(r,'U','У');
  r:=replace(r,'F','Ф'); r:=replace(r,'H','Х'); r:=replace(r,'C','К');
  r:=replace(r,'W','В'); r:=replace(r,'X','Кс'); r:=replace(r,'Y','Й');
  r:=replace(r,'J','Дж');
  RETURN r;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION _tmp_ru_to_en(input text) RETURNS text AS $$
DECLARE r text := input;
BEGIN
  r:=replace(r,'щ','shch'); r:=replace(r,'Щ','Shch');
  r:=replace(r,'ш','sh'); r:=replace(r,'Ш','Sh');
  r:=replace(r,'ч','ch'); r:=replace(r,'Ч','Ch');
  r:=replace(r,'ж','zh'); r:=replace(r,'Ж','Zh');
  r:=replace(r,'ц','ts'); r:=replace(r,'Ц','Ts');
  r:=replace(r,'я','ya'); r:=replace(r,'Я','Ya');
  r:=replace(r,'ю','yu'); r:=replace(r,'Ю','Yu');
  r:=replace(r,'ё','yo'); r:=replace(r,'Ё','Yo');
  r:=replace(r,'э','e'); r:=replace(r,'Э','E');
  r:=replace(r,'а','a'); r:=replace(r,'б','b'); r:=replace(r,'в','v');
  r:=replace(r,'г','g'); r:=replace(r,'д','d'); r:=replace(r,'е','e');
  r:=replace(r,'з','z'); r:=replace(r,'и','i'); r:=replace(r,'й','y');
  r:=replace(r,'к','k'); r:=replace(r,'л','l'); r:=replace(r,'м','m');
  r:=replace(r,'н','n'); r:=replace(r,'о','o'); r:=replace(r,'п','p');
  r:=replace(r,'р','r'); r:=replace(r,'с','s'); r:=replace(r,'т','t');
  r:=replace(r,'у','u'); r:=replace(r,'ф','f'); r:=replace(r,'х','kh');
  r:=replace(r,'ъ',''); r:=replace(r,'ы','y'); r:=replace(r,'ь','');
  r:=replace(r,'А','A'); r:=replace(r,'Б','B'); r:=replace(r,'В','V');
  r:=replace(r,'Г','G'); r:=replace(r,'Д','D'); r:=replace(r,'Е','E');
  r:=replace(r,'З','Z'); r:=replace(r,'И','I'); r:=replace(r,'Й','Y');
  r:=replace(r,'К','K'); r:=replace(r,'Л','L'); r:=replace(r,'М','M');
  r:=replace(r,'Н','N'); r:=replace(r,'О','O'); r:=replace(r,'П','P');
  r:=replace(r,'Р','R'); r:=replace(r,'С','S'); r:=replace(r,'Т','T');
  r:=replace(r,'У','U'); r:=replace(r,'Ф','F'); r:=replace(r,'Х','Kh');
  r:=replace(r,'Ъ',''); r:=replace(r,'Ы','Y'); r:=replace(r,'Ь','');
  RETURN r;
END; $$ LANGUAGE plpgsql;

-- 3. Заполняем теги для существующих клиентов
--    Английские ники → русский тег  (Alien → Алиен, Nevada → Невада)
UPDATE profiles
SET search_tags = ARRAY[_tmp_en_to_ru(nickname)]
WHERE role = 'client'
  AND deleted_at IS NULL
  AND (search_tags = '{}' OR search_tags IS NULL)
  AND nickname ~ '[a-zA-Z]'
  AND nickname !~ '[а-яА-ЯёЁ]';

--    Русские ники → английский тег  (Менталист → Mentalist, Ханна → Khanna)
UPDATE profiles
SET search_tags = ARRAY[_tmp_ru_to_en(nickname)]
WHERE role = 'client'
  AND deleted_at IS NULL
  AND (search_tags = '{}' OR search_tags IS NULL)
  AND nickname ~ '[а-яА-ЯёЁ]'
  AND nickname !~ '[a-zA-Z]';

-- 4. Удаляем временные функции
DROP FUNCTION IF EXISTS _tmp_en_to_ru(text);
DROP FUNCTION IF EXISTS _tmp_ru_to_en(text);

-- 5. Проверяем результат
SELECT nickname, search_tags
FROM profiles
WHERE search_tags != '{}'
ORDER BY nickname;

-- ============================================
-- 6. Storage bucket для фото клиентов
-- ============================================

-- Создаём публичный bucket (если нет)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Политики для storage (безопасно для повторного запуска)
DO $$ BEGIN
  CREATE POLICY "client_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_photos_insert_anon" ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_photos_select" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_photos_update" ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "client_photos_delete_anon" ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

