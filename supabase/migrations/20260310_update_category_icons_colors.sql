-- Assign intuitive icons and colors to existing menu categories
-- Напитки (drinks) — синий, стакан воды
UPDATE menu_categories SET icon_name = 'GlassWater', color = 'blue' WHERE slug = 'drinks';

-- Энергетики — жёлтый/amber, молния
UPDATE menu_categories SET icon_name = 'Zap', color = 'amber' WHERE slug IN ('energy', 'energetiki', 'энергетики');

-- Алкоголь — розовый/rose, мартини
UPDATE menu_categories SET icon_name = 'Martini', color = 'rose' WHERE slug IN ('alcohol', 'alkogol', 'алкоголь');

-- Чай/Кофе — изумрудный/emerald, кофейная чашка
UPDATE menu_categories SET icon_name = 'Coffee', color = 'emerald' WHERE slug IN ('tea_coffee', 'chai_kofe', 'чай_кофе', 'tea', 'coffee');

-- Еда (food) — оранжевый, столовые приборы
UPDATE menu_categories SET icon_name = 'UtensilsCrossed', color = 'orange' WHERE slug = 'food';

-- Снеки (bar/snacks) — жёлтый (amber), печенька
UPDATE menu_categories SET icon_name = 'Cookie', color = 'amber' WHERE slug IN ('bar', 'snacks', 'снеки', 'sneki');

-- Кальяны (hookah) — фиолетовый, ветер
UPDATE menu_categories SET icon_name = 'Wind', color = 'violet' WHERE slug = 'hookah';

-- Тарифы/Услуги (services) — индиго, таймер
UPDATE menu_categories SET icon_name = 'Timer', color = 'indigo' WHERE slug IN ('services', 'tariffs', 'тарифы', 'tarify');
