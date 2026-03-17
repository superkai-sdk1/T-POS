import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Download, CheckCircle, AlertCircle, RefreshCw, ExternalLink,
  GitBranch, Clock, Server, Code2, Sparkles, RotateCcw, Trash2,
} from 'lucide-react';

const UPDATE_API = '/api/system';

interface SystemInfo {
  version: string;
  git: { hash: string; date: string; branch: string };
  updateAvailable: boolean;
  behindCount: number;
  nodeVersion: string;
}

type UpdateStatus = 'idle' | 'updating' | 'complete' | 'error';

interface LogEntry {
  type: 'step' | 'step_done' | 'log' | 'complete' | 'error';
  label?: string;
  step?: number;
  total?: number;
  text?: string;
  message?: string;
}

export function AboutSystem() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoError, setInfoError] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(3);
  const [stepLabel, setStepLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const loadInfo = useCallback(async () => {
    setInfoLoading(true);
    setInfoError(false);
    try {
      const res = await fetch(`${UPDATE_API}/info`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInfo(data);
    } catch {
      setInfoError(true);
    }
    setInfoLoading(false);
  }, []);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const [checking, setChecking] = useState(false);

  const handleCheckUpdate = async () => {
    setChecking(true);
    await loadInfo();
    setChecking(false);
  };

  const handleUpdate = async () => {
    setStatus('updating');
    setLogs([]);
    setCurrentStep(0);
    setErrorMsg('');

    try {
      const res = await fetch(`${UPDATE_API}/update`, { method: 'POST' });
      if (!res.ok || !res.body) {
        setStatus('error');
        setErrorMsg('Не удалось подключиться к серверу обновлений');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data: LogEntry = JSON.parse(line.slice(6));
            setLogs((prev) => [...prev, data]);

            if (data.type === 'step') {
              setCurrentStep(data.step || 0);
              setTotalSteps(data.total || 3);
              setStepLabel(data.label || '');
            }
            if (data.type === 'step_done') {
              setCurrentStep(data.step || 0);
            }
            if (data.type === 'complete') {
              setStatus('complete');
              finished = true;
            }
            if (data.type === 'error') {
              setStatus('error');
              setErrorMsg(data.message || 'Неизвестная ошибка');
              finished = true;
            }
          } catch { /* parse error — ignore */ }
        }
      }
      if (!finished) {
        setStatus('error');
        setErrorMsg('Поток обновления завершился без результата');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Потеряно соединение с сервером обновлений');
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);

  const handleClearCacheAndReload = async () => {
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
      localStorage.clear();
      sessionStorage.clear();
      if ('indexedDB' in window) {
        if (indexedDB.databases) {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name) indexedDB.deleteDatabase(db.name);
          }
        }
      }
    } catch (e) {
      // Clear cache error - ignore
    }
    window.location.href = window.location.origin + window.location.pathname + '?nocache=' + Date.now();
  };

  const progressPct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return d; }
  };

  return (
    <div className="space-y-5">
      {/* Logo & title */}
      <div className="flex flex-col items-center gap-3 py-4">
        <img src="/icons/tpos.svg" alt="T-POS" className="w-36 h-auto drop-shadow-lg" />
        <p className="text-xs text-[var(--c-hint)] mt-0.5">Система автоматизации клуба «Титан»</p>
      </div>

      {/* System info cards */}
      {infoLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-[var(--c-surface)]" />)}
        </div>
      ) : infoError ? (
        <div className="p-4 rounded-xl bg-[var(--c-warning-bg)] border border-[var(--c-border)] text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-[var(--c-warning)] mx-auto" />
          <p className="text-xs text-[var(--c-warning)]">Сервер обновлений недоступен</p>
          <p className="text-[10px] text-[var(--c-muted)]">Убедитесь что update-server запущен на сервере</p>
          <Button size="sm" variant="secondary" onClick={loadInfo}>
            <RefreshCw className="w-3 h-3" />
            Повторить
          </Button>
        </div>
      ) : info && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl card space-y-1">
              <div className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-[var(--c-accent)]" />
                <span className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">Версия</span>
              </div>
              <p className="text-lg font-black text-[var(--c-text)] tabular-nums">{info.version}</p>
            </div>
            <div className="p-3 rounded-xl card space-y-1">
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-[var(--c-success)]" />
                <span className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">Ветка</span>
              </div>
              <p className="text-lg font-black text-[var(--c-text)]">{info.git.branch}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl card flex items-center gap-3">
            <Clock className="w-4 h-4 text-[var(--c-hint)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">Последний коммит</p>
              <p className="text-[13px] text-[var(--c-text)]">
                <span className="font-mono text-[var(--c-accent)]">{info.git.hash}</span>
                <span className="text-[var(--c-muted)] mx-1.5">·</span>
                {fmtDate(info.git.date)}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl card flex items-center gap-3">
            <Server className="w-4 h-4 text-[var(--c-hint)] shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">Node.js</p>
              <p className="text-[13px] text-[var(--c-text)]">{info.nodeVersion}</p>
            </div>
          </div>

          {info.updateAvailable && status === 'idle' && (
            <div className="p-3 rounded-xl bg-[var(--c-success-bg)] border border-[var(--c-border)] flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[var(--c-success)] shrink-0" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[var(--c-success)]">Доступно обновление</p>
                <p className="text-[10px] text-[var(--c-hint)]">{info.behindCount} новых коммитов</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Update controls */}
      {status === 'idle' && (
        <div className="flex gap-2">
          <Button
            fullWidth
            variant="secondary"
            size="md"
            onClick={handleCheckUpdate}
            loading={checking}
          >
            <RefreshCw className="w-4 h-4" />
            Проверить обновления
          </Button>
          {info?.updateAvailable && (
            <Button fullWidth size="md" onClick={handleUpdate}>
              <Download className="w-4 h-4" />
              Обновить
            </Button>
          )}
        </div>
      )}

      {/* Update progress */}
      {(status === 'updating' || status === 'complete' || status === 'error') && (
        <div className="space-y-3">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--c-text)]">
                {status === 'complete' ? 'Готово' : status === 'error' ? 'Ошибка' : stepLabel}
              </span>
              <span className="text-[11px] font-bold tabular-nums text-[var(--c-hint)]">
                {status === 'complete' ? '100%' : `${progressPct}%`}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--c-surface)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  status === 'error' ? 'bg-red-500' : status === 'complete' ? 'bg-emerald-500' : 'bg-[var(--c-accent)]'
                }`}
                style={{ width: `${status === 'complete' ? 100 : progressPct}%` }}
              />
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => {
              const done = i + 1 <= currentStep;
              const active = i + 1 === currentStep && status === 'updating';
              return (
                <div key={i} className="flex-1 flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    done ? 'bg-emerald-500' : active ? 'bg-[var(--c-accent)]' : 'bg-[var(--c-surface)]'
                  }`}>
                    {done ? (
                      <CheckCircle className="w-3 h-3 text-white" />
                    ) : active ? (
                      <RefreshCw className="w-3 h-3 text-white animate-spin" />
                    ) : (
                      <span className="text-[9px] font-bold text-[var(--c-hint)]">{i + 1}</span>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium truncate ${done ? 'text-[var(--c-success)]' : active ? 'text-[var(--c-text)]' : 'text-[var(--c-muted)]'}`}>
                    {i === 0 ? 'Git' : i === 1 ? 'npm' : 'Build'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Logs */}
          <div className="max-h-40 overflow-y-auto rounded-xl bg-black/30 p-3 border border-[var(--c-border)]">
            <div className="space-y-0.5 font-mono text-[10px] leading-relaxed">
              {logs.filter((l) => l.type !== 'step' || l.label).map((log, i) => (
                <div key={i} className={
                  log.type === 'step' ? 'text-[var(--c-accent)] font-semibold pt-1' :
                  log.type === 'step_done' ? 'text-[var(--c-success)]' :
                  log.type === 'error' ? 'text-[var(--c-danger)]' :
                  log.type === 'complete' ? 'text-[var(--c-success)] font-semibold' :
                  'text-[var(--c-hint)]'
                }>
                  {log.type === 'step' && `▸ ${log.label}...`}
                  {log.type === 'step_done' && `✓ ${log.label}`}
                  {log.type === 'log' && log.text}
                  {log.type === 'error' && `✗ ${log.message}`}
                  {log.type === 'complete' && `✓ ${log.message}`}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Error state */}
          {status === 'error' && (
            <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-border)] text-center space-y-2">
              <AlertCircle className="w-5 h-5 text-[var(--c-danger)] mx-auto" />
              <p className="text-xs text-[var(--c-danger)]">{errorMsg}</p>
              <Button size="sm" variant="secondary" onClick={() => setStatus('idle')}>
                Назад
              </Button>
            </div>
          )}

          {/* Success — offer reload */}
          {status === 'complete' && (
            <div className="p-4 rounded-xl bg-[var(--c-success-bg)] border border-[var(--c-border)] text-center space-y-3">
              <CheckCircle className="w-8 h-8 text-[var(--c-success)] mx-auto" />
              <div>
                <p className="text-sm font-bold text-[var(--c-success)]">Обновление завершено</p>
                <p className="text-[11px] text-[var(--c-hint)] mt-0.5">Перезагрузите приложение для применения</p>
              </div>
              <Button fullWidth size="lg" onClick={handleReload}>
                <RotateCcw className="w-4 h-4" />
                Перезагрузить приложение
              </Button>
            </div>
          )}
        </div>
      )}

      {/* PWA: Clear cache & reload */}
      <div className="space-y-2 pt-2 border-t border-[var(--c-border)]">
        <div className="flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5 text-[var(--c-hint)]" />
          <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase tracking-wider">PWA</p>
        </div>
        {showClearCacheConfirm ? (
          <div className="p-3 rounded-xl bg-[var(--c-warning-bg)] border border-[var(--c-border)] space-y-2">
            <p className="text-xs text-[var(--c-text)]">
              Удалить весь кэш, локальные данные и перезагрузить приложение с нуля? Потребуется повторный вход.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                fullWidth
                onClick={() => setShowClearCacheConfirm(false)}
              >
                Отмена
              </Button>
              <Button
                size="sm"
                variant="danger"
                fullWidth
                onClick={handleClearCacheAndReload}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Очистить и перезагрузить
              </Button>
            </div>
          </div>
        ) : (
          <Button
            fullWidth
            variant="secondary"
            size="md"
            onClick={() => setShowClearCacheConfirm(true)}
            className="border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
          >
            <Trash2 className="w-4 h-4" />
            Очистить кэш и перезагрузить
          </Button>
        )}
      </div>

      {/* Developer info */}
      <div className="space-y-2 pt-2 border-t border-[var(--c-border)]">
        <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase tracking-wider">Разработка</p>

        <div className="p-3 rounded-xl card flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[rgba(var(--c-accent-rgb),0.1)] flex items-center justify-center">
            <span className="text-sm font-bold text-[var(--c-accent)]">K</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--c-text)]">Kai Michaelson</p>
            <p className="text-[11px] text-[var(--c-hint)]">Full-stack developer</p>
          </div>
          <a
            href="https://t.me/thiskai"
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-lg bg-[var(--c-info-bg)] flex items-center justify-center active:scale-90 transition-transform"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[var(--c-info)]" />
          </a>
        </div>

        <div className="p-3 rounded-xl card flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--c-surface)] flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-[var(--c-hint)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--c-text)]">GitHub</p>
            <p className="text-[11px] text-[var(--c-hint)] truncate">superkai-sdk1/T-POS</p>
          </div>
          <a
            href="https://github.com/superkai-sdk1/T-POS"
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90 transition-transform"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[var(--c-hint)]" />
          </a>
        </div>
      </div>

      <p className="text-center text-[10px] text-[var(--c-muted)] pb-2">
        T-POS © {new Date().getFullYear()} · Клуб спортивной мафии «Титан»
      </p>
    </div>
  );
}
