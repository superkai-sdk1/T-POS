import { create } from 'zustand';
import type { PaymentMethod } from '@/types';

export type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

const REPORT_DAY_HOUR = 10;

export function getReportingDayStart(date: Date): Date {
  const d = new Date(date);
  if (d.getHours() < REPORT_DAY_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(REPORT_DAY_HOUR, 0, 0, 0);
  return d;
}

function presetToRange(preset: PeriodPreset): DateRange {
  const now = new Date();
  const todayStart = getReportingDayStart(now);

  switch (preset) {
    case 'today':
      return { start: todayStart, end: new Date(todayStart.getTime() + 86400000) };
    case 'yesterday': {
      const ys = new Date(todayStart.getTime() - 86400000);
      return { start: ys, end: todayStart };
    }
    case 'week':
      return { start: new Date(todayStart.getTime() - 6 * 86400000), end: new Date(todayStart.getTime() + 86400000) };
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(todayStart.getTime() + 86400000) };
    case 'quarter': {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), qm, 1), end: new Date(todayStart.getTime() + 86400000) };
    }
    default:
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(todayStart.getTime() + 86400000) };
  }
}

export function getPreviousPeriod(range: DateRange): DateRange {
  const diff = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - diff), end: new Date(range.start.getTime()) };
}

interface AnalyticsState {
  preset: PeriodPreset;
  range: DateRange;
  prevRange: DateRange;
  paymentFilter: PaymentMethod | null;
  adminFilter: string | null;
  search: string;

  setPreset: (p: PeriodPreset) => void;
  setCustomRange: (start: Date, end: Date) => void;
  setPaymentFilter: (pm: PaymentMethod | null) => void;
  setAdminFilter: (id: string | null) => void;
  setSearch: (s: string) => void;
}

const initialRange = presetToRange('month');

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  preset: 'month',
  range: initialRange,
  prevRange: getPreviousPeriod(initialRange),
  paymentFilter: null,
  adminFilter: null,
  search: '',

  setPreset: (p) => {
    const range = presetToRange(p);
    set({ preset: p, range, prevRange: getPreviousPeriod(range) });
  },
  setCustomRange: (start, end) => {
    const range = { start, end };
    set({ preset: 'custom', range, prevRange: getPreviousPeriod(range) });
  },
  setPaymentFilter: (pm) => set({ paymentFilter: pm }),
  setAdminFilter: (id) => set({ adminFilter: id }),
  setSearch: (s) => set({ search: s }),
}));
