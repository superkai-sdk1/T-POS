import { useEffect } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { useAdminTabletStore } from '@/store/tablet-admin';
import { Package, Send, Check, X, Bell } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';
import { useAuthStore } from '@/store/auth';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TabletOrdersDrawer({ open, onClose }: Props) {
  const adminId = useAuthStore((s) => s.user?.id);
  const { pendingOrders, isLoading, loadPendingOrders, acceptOrder, rejectOrder, openOrderSpaceCheck } = useAdminTabletStore();

  useEffect(() => {
    if (open) {
      loadPendingOrders();
    }
  }, [open, loadPendingOrders]);

  const handleAccept = async (orderId: string, spaceId: string) => {
    if (!adminId) return;
    hapticFeedback();
    const success = await acceptOrder(orderId, adminId);
    if (!success) {
      // Try to open a check automatically or show error
      const checkId = await openOrderSpaceCheck(spaceId, adminId);
      if (checkId) {
        // Retry adding
        await acceptOrder(orderId, adminId);
      } else {
        alert('Не удалось открыть чек для этой кабинки.');
      }
    }
  };

  const handleReject = async (orderId: string) => {
    if (!adminId) return;
    hapticFeedback();
    await rejectOrder(orderId, adminId);
  };

  return (
    <Drawer open={open} onClose={onClose} title="Заказы с планшетов" size="md">
      <div className="flex flex-col h-full -mx-6 -mb-6 sm:-mx-10 sm:-mb-10 bg-[var(--c-bg)]">
        <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 space-y-4">
          {isLoading && pendingOrders.length === 0 ? (
            <div className="text-center py-10 text-[var(--c-hint)]">Загрузка...</div>
          ) : pendingOrders.length === 0 ? (
            <div className="text-center py-20">
              <Bell className="w-12 h-12 text-[var(--c-border)] mx-auto mb-4" />
              <p className="text-[var(--c-hint)] font-medium">Новых заказов нет</p>
            </div>
          ) : (
            pendingOrders.map((order) => {
              const time = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={order.id} className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl overflow-hidden shadow-sm">
                  {/* Заголовок заказа */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)] bg-[var(--c-surface-hover)]">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--c-text)]">
                        Кабинка: {order.space?.name || 'Н/Д'}
                      </h3>
                      <p className="text-xs text-[var(--c-muted)] mt-0.5">
                        Планшет: {order.profile?.nickname} • {time}
                      </p>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-1 rounded-lg">
                      Ожидает
                    </div>
                  </div>

                  {/* Содержимое заказа */}
                  <div className="px-5 py-4 space-y-3">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex justify-between items-center">
                        <span className="text-sm font-medium text-[var(--c-text)]">{item.item?.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                          <span className="text-sm font-black text-[var(--c-muted)] min-w-[50px] text-right">
                            {item.quantity * (item.item?.price || 0)} ₽
                          </span>
                        </div>
                      </div>
                    ))}

                    {order.comment && (
                      <div className="mt-4 pt-3 border-t border-[var(--c-border)]">
                        <span className="text-[10px] uppercase font-bold text-[var(--c-hint)] block mb-1">Комментарий</span>
                        <p className="text-sm text-[var(--c-text)] bg-[var(--c-bg)] p-3 rounded-xl border border-[var(--c-border)]">
                          {order.comment}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Кнопки */}
                  <div className="flex items-center gap-2 p-3 bg-[var(--c-bg)]">
                    <button
                      onClick={() => handleReject(order.id)}
                      className="flex-1 p-3 rounded-xl flex items-center justify-center gap-2 text-red-500 font-bold bg-red-500/10 hover:bg-red-500/20 active:scale-[0.98] transition-all"
                    >
                      <X className="w-5 h-5" /> Отклонить
                    </button>
                    <button
                      onClick={() => handleAccept(order.id, order.space_id)}
                      className="flex-1 p-3 rounded-xl flex items-center justify-center gap-2 text-white font-bold bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all"
                    >
                      <Check className="w-5 h-5" /> Принять
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Drawer>
  );
}
