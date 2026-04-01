import type { InventoryItem, VisitTariff, ClientTier } from '@/types';

export const VISIT_TARIFF_DB_NAMES: Record<VisitTariff, { label: string; fallbackPrice: number; dbName: string }> = {
  regular: { label: 'Гость', fallbackPrice: 700, dbName: 'Игровой вечер Гость' },
  resident: { label: 'Резидент', fallbackPrice: 500, dbName: 'Игровой вечер Резидент' },
  student: { label: 'Студент', fallbackPrice: 300, dbName: 'Игровой вечер Студент' },
  single_game: { label: 'Одна игра', fallbackPrice: 150, dbName: 'Игровой вечер Одна игра' },
};

export interface VisitTariffInfo {
  label: string;
  price: number;
  dbName: string;
}

/**
 * Returns visit tariff pricing resolved against actual inventory prices.
 * Falls back to hardcoded defaults if inventory item is not found.
 */
export function getVisitItems(inventory: InventoryItem[]): Record<VisitTariff, VisitTariffInfo> {
  const result = {} as Record<VisitTariff, VisitTariffInfo>;
  for (const [key, info] of Object.entries(VISIT_TARIFF_DB_NAMES) as [VisitTariff, typeof VISIT_TARIFF_DB_NAMES['regular']][]) {
    const invItem = inventory.find((i) => i.name === info.dbName);
    result[key] = {
      label: info.label,
      dbName: info.dbName,
      price: invItem?.price ?? info.fallbackPrice,
    };
  }
  return result;
}

export function tierToTariff(tier: ClientTier | undefined): VisitTariff {
  if (tier === 'resident') return 'resident';
  if (tier === 'student') return 'student';
  return 'regular';
}
