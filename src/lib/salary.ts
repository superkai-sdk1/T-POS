/**
 * Salary calculation based on shift revenue:
 * - revenue ≤ 7000₽ → 700₽
 * - each 1000₽ above 7000 → +100₽
 * - 7001-8000 → 800₽, 8001-9000 → 900₽, etc.
 */
export function calcSalaryFromRevenue(revenue: number): number {
  if (revenue <= 7000) return 700;
  const extra = Math.ceil((revenue - 7000) / 1000) * 100;
  return 700 + extra;
}
