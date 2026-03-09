-- ============================================
-- Добавление search_tags в profiles
-- Вставить в Supabase → SQL Editor → New Query → Run
-- ============================================

-- 1. Добавить колонку (если нет)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_tags text[] NOT NULL DEFAULT '{}';

-- 2. Автогенерация тегов с транскрипцией EN→RU и RU→EN для существующих клиентов
-- Маппинг транскрипции
CREATE OR REPLACE FUNCTION transliterate_en_to_ru(input text) RETURNS text AS $$
DECLARE
  result text := input;
BEGIN
  result := replace(result, 'sh', 'ш');
  result := replace(result, 'ch', 'ч');
  result := replace(result, 'zh', 'ж');
  result := replace(result, 'ts', 'ц');
  result := replace(result, 'ya', 'я');
  result := replace(result, 'yu', 'ю');
  result := replace(result, 'yo', 'ё');
  result := replace(result, 'ey', 'ей');
  result := replace(result, 'iy', 'ий');
  result := replace(result, 'Sh', 'Ш');
  result := replace(result, 'Ch', 'Ч');
  result := replace(result, 'Zh', 'Ж');
  result := replace(result, 'Ts', 'Ц');
  result := replace(result, 'Ya', 'Я');
  result := replace(result, 'Yu', 'Ю');
  result := replace(result, 'Yo', 'Ё');
  result := replace(result, 'a', 'а'); result := replace(result, 'A', 'А');
  result := replace(result, 'b', 'б'); result := replace(result, 'B', 'Б');
  result := replace(result, 'v', 'в'); result := replace(result, 'V', 'В');
  result := replace(result, 'g', 'г'); result := replace(result, 'G', 'Г');
  result := replace(result, 'd', 'д'); result := replace(result, 'D', 'Д');
  result := replace(result, 'e', 'е'); result := replace(result, 'E', 'Е');
  result := replace(result, 'z', 'з'); result := replace(result, 'Z', 'З');
  result := replace(result, 'i', 'и'); result := replace(result, 'I', 'И');
  result := replace(result, 'k', 'к'); result := replace(result, 'K', 'К');
  result := replace(result, 'l', 'л'); result := replace(result, 'L', 'Л');
  result := replace(result, 'm', 'м'); result := replace(result, 'M', 'М');
  result := replace(result, 'n', 'н'); result := replace(result, 'N', 'Н');
  result := replace(result, 'o', 'о'); result := replace(result, 'O', 'О');
  result := replace(result, 'p', 'п'); result := replace(result, 'P', 'П');
  result := replace(result, 'r', 'р'); result := replace(result, 'R', 'Р');
  result := replace(result, 's', 'с'); result := replace(result, 'S', 'С');
  result := replace(result, 't', 'т'); result := replace(result, 'T', 'Т');
  result := replace(result, 'u', 'у'); result := replace(result, 'U', 'У');
  result := replace(result, 'f', 'ф'); result := replace(result, 'F', 'Ф');
  result := replace(result, 'h', 'х'); result := replace(result, 'H', 'Х');
  result := replace(result, 'c', 'к'); result := replace(result, 'C', 'К');
  result := replace(result, 'w', 'в'); result := replace(result, 'W', 'В');
  result := replace(result, 'x', 'кс'); result := replace(result, 'X', 'Кс');
  result := replace(result, 'y', 'й'); result := replace(result, 'Y', 'Й');
  result := replace(result, 'j', 'дж'); result := replace(result, 'J', 'Дж');
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION transliterate_ru_to_en(input text) RETURNS text AS $$
DECLARE
  result text := input;
BEGIN
  result := replace(result, 'ш', 'sh'); result := replace(result, 'Ш', 'Sh');
  result := replace(result, 'щ', 'sch'); result := replace(result, 'Щ', 'Sch');
  result := replace(result, 'ч', 'ch'); result := replace(result, 'Ч', 'Ch');
  result := replace(result, 'ж', 'zh'); result := replace(result, 'Ж', 'Zh');
  result := replace(result, 'ц', 'ts'); result := replace(result, 'Ц', 'Ts');
  result := replace(result, 'я', 'ya'); result := replace(result, 'Я', 'Ya');
  result := replace(result, 'ю', 'yu'); result := replace(result, 'Ю', 'Yu');
  result := replace(result, 'ё', 'yo'); result := replace(result, 'Ё', 'Yo');
  result := replace(result, 'э', 'e'); result := replace(result, 'Э', 'E');
  result := replace(result, 'а', 'a'); result := replace(result, 'А', 'A');
  result := replace(result, 'б', 'b'); result := replace(result, 'Б', 'B');
  result := replace(result, 'в', 'v'); result := replace(result, 'В', 'V');
  result := replace(result, 'г', 'g'); result := replace(result, 'Г', 'G');
  result := replace(result, 'д', 'd'); result := replace(result, 'Д', 'D');
  result := replace(result, 'е', 'e'); result := replace(result, 'Е', 'E');
  result := replace(result, 'з', 'z'); result := replace(result, 'З', 'Z');
  result := replace(result, 'и', 'i'); result := replace(result, 'И', 'I');
  result := replace(result, 'й', 'y'); result := replace(result, 'Й', 'Y');
  result := replace(result, 'к', 'k'); result := replace(result, 'К', 'K');
  result := replace(result, 'л', 'l'); result := replace(result, 'Л', 'L');
  result := replace(result, 'м', 'm'); result := replace(result, 'М', 'M');
  result := replace(result, 'н', 'n'); result := replace(result, 'Н', 'N');
  result := replace(result, 'о', 'o'); result := replace(result, 'О', 'O');
  result := replace(result, 'п', 'p'); result := replace(result, 'П', 'P');
  result := replace(result, 'р', 'r'); result := replace(result, 'Р', 'R');
  result := replace(result, 'с', 's'); result := replace(result, 'С', 'S');
  result := replace(result, 'т', 't'); result := replace(result, 'Т', 'T');
  result := replace(result, 'у', 'u'); result := replace(result, 'У', 'U');
  result := replace(result, 'ф', 'f'); result := replace(result, 'Ф', 'F');
  result := replace(result, 'х', 'h'); result := replace(result, 'Х', 'H');
  result := replace(result, 'ъ', ''); result := replace(result, 'Ъ', '');
  result := replace(result, 'ы', 'y'); result := replace(result, 'Ы', 'Y');
  result := replace(result, 'ь', ''); result := replace(result, 'Ь', '');
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Определяем язык никнейма и добавляем транскрипцию
-- Английские ники → тег с русской транскрипцией
UPDATE profiles
SET search_tags = ARRAY[transliterate_en_to_ru(nickname)]
WHERE role = 'client'
  AND deleted_at IS NULL
  AND (search_tags = '{}' OR search_tags IS NULL)
  AND nickname ~ '[a-zA-Z]'
  AND nickname !~ '[а-яА-ЯёЁ]';

-- Русские ники → тег с английской транслитерацией
UPDATE profiles
SET search_tags = ARRAY[transliterate_ru_to_en(nickname)]
WHERE role = 'client'
  AND deleted_at IS NULL
  AND (search_tags = '{}' OR search_tags IS NULL)
  AND nickname ~ '[а-яА-ЯёЁ]'
  AND nickname !~ '[a-zA-Z]';

-- 4. Удаляем функции (больше не нужны)
DROP FUNCTION IF EXISTS transliterate_en_to_ru(text);
DROP FUNCTION IF EXISTS transliterate_ru_to_en(text);

-- Готово! Проверьте результат:
-- SELECT nickname, search_tags FROM profiles WHERE search_tags != '{}' ORDER BY nickname;

