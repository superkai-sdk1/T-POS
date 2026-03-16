import { Drawer } from '@/components/ui/Drawer';
import { Receipt, Banknote, CreditCard, HandCoins, Star, Gift, RotateCcw } from 'lucide-react';

const pmLabels: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы', deposit: 'Депозит', split: 'Разделённая',
};

const pmIcons: Record<string, typeof Banknote> = {
  cash: Banknote, card: CreditCard, debt: HandCoins, bonus: Star, deposit: Gift, split: Receipt,
};

export interface CheckDetail {
  id: string;
  player_nickname: string;
  total_amount: number;
  payment_method: string | null;
  bonus_used: number;
  certificate_used?: number;
  closed_at: string;
  items: { name: string; quantity: number; price: number }[];
  payments?: { method: string; amount: number }[];
  refund_amount?: number;
}

interface Props {
  check: CheckDetail | null;
  open: boolean;
  onClose: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
const fmtCur = (n: number) => fmt(n) + '₽';

export function CheckDetailDrawer({ check, open, onClose }: Props) {
  if (!check) return null;

  const origTotal = check.total_amount + (check.bonus_used || 0);
  const paymentMethod = check.payment_method || 'unknown';
  const Icon = pmIcons[paymentMethod] || Receipt;

  return (
    <Drawer open={open} onClose={onClose} title="Чек" size="md">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--c-hint)]">
            {new Date(check.closed_at).toLocaleDateString('ru-RU', {
              day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
            })}
          </span>
          <span className="text-lg font-black text-[var(--c-accent)] tabular-nums">{fmtCur(check.total_amount)}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[var(--c-text)]">{check.player_nickname}</span>
          {check.refund_amount != null && check.refund_amount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--c-warning-bg)] text-[var(--c-warning)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20">
              <RotateCcw className="w-3 h-3" /> Возврат −{fmtCur(check.refund_amount)}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20 ${
            paymentMethod === 'cash' ? 'bg-[var(--c-success-bg)] text-[var(--c-success)]' :
            paymentMethod === 'card' ? 'bg-[var(--c-info-bg)] text-[var(--c-info)]' :
            paymentMethod === 'debt' ? 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]' :
            'bg-[var(--c-warning-bg)] text-[var(--c-warning)]'
          }`}>
            <Icon className="w-3 h-3" />
            {pmLabels[paymentMethod] || paymentMethod}
          </span>
        </div>

        <div className="border-t border-[var(--c-border)] pt-3">
          <p className="text-xs font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">Позиции</p>
          <div className="space-y-2">
            {check.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-[var(--c-text)]">{item.name} × {item.quantity}</span>
                <span className="text-[var(--c-hint)] tabular-nums">{fmtCur(item.quantity * item.price)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--c-border)] pt-3 space-y-2">
          {origTotal !== check.total_amount && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--c-hint)]">Сумма</span>
                <span className="tabular-nums">{fmtCur(origTotal)}</span>
              </div>
              {check.bonus_used > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--c-warning)]">Бонусами</span>
                  <span className="text-[var(--c-warning)] tabular-nums">−{fmtCur(check.bonus_used)}</span>
                </div>
              )}
            </>
          )}
          {check.payments && check.payments.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-[var(--c-hint)]">Разделённая оплата</p>
              {check.payments.map((p, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-[var(--c-hint)]">{pmLabels[p.method] || p.method}</span>
                  <span className="tabular-nums">{fmtCur(p.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-between text-sm font-bold pt-1">
            <span className="text-[var(--c-text)]">Итого</span>
            <span className="text-[var(--c-accent)] tabular-nums">{fmtCur(check.total_amount)}</span>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
