import { type ReactNode } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const isPlaceholder = (s: string) =>
  !s || s.includes('your-project') || s.includes('your-anon') || s === 'placeholder-key';

const hasValidSupabase = url && key && !isPlaceholder(url) && !isPlaceholder(key);

export function ConfigGuard({ children }: { children: ReactNode }) {
  if (hasValidSupabase) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#0a0e1a] text-white"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-bold text-red-400">Supabase не настроен</h1>
        <p className="text-sm text-white/70">
          В файле .env отсутствуют или неверны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.
          Приложение собрано без корректных ключей.
        </p>
        <div className="text-left text-xs text-white/50 space-y-1 p-4 rounded-xl bg-white/5">
          <p>1. Проверьте .env на сервере</p>
          <p>2. Убедитесь, что есть VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY</p>
          <p>3. Пересоберите: npm run build && npm run build:wallet</p>
          <p>4. Перезапустите nginx</p>
        </div>
        <p className="text-xs text-white/40">
          Запустите: <code className="bg-white/10 px-1 rounded">./scripts/check-env.sh</code> и{' '}
          <code className="bg-white/10 px-1 rounded">./scripts/diagnose-server.sh</code>
        </p>
      </div>
    </div>
  );
}
