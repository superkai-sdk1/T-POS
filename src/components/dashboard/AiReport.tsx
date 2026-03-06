import { useState, useCallback, useRef, memo } from 'react';
import { Sparkles, Send, Loader2, ChevronDown, ChevronUp, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AnalyticsContext {
  revenue: number;
  prevRevenue: number;
  revenueDelta: number;
  netProfit: number;
  marginPct: number;
  totalExpenses: number;
  cogs: number;
  periodExpenses: number;
  checkCount: number;
  avgCheck: number;
  totalDebt: number;
  debtorsCount: number;
  retentionRate: number;
  playerSegments: { new: number; active: number; sleeping: number };
  topProducts: { name: string; revenue: number; qty: number; abcGroup: string }[];
  topPlayers: { nickname: string; total: number; count: number; segment: string }[];
  paymentBreakdown: { cash: number; card: number; debt: number; bonus: number };
  period: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AI_API = '/api/ai';

async function callAI(messages: { role: string; content: string }[], context: AnalyticsContext): Promise<string> {
  try {
    const res = await fetch(AI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.response || data.error || 'Нет ответа';
  } catch (e) {
    return `Ошибка: ${e instanceof Error ? e.message : 'Не удалось связаться с ИИ'}`;
  }
}

function buildReportPrompt(userName: string): string {
  return `Ты — профессиональный бизнес-аналитик POS-системы T-POS для развлекательных клубов (мафия-клуб, бар, настольные игры).
Обращайся к пользователю по имени: ${userName}.

ЗАДАЧА: Сгенерировать подробный, красиво оформленный аналитический отчёт в формате HTML.

ФОРМАТ ОТВЕТА — чистый HTML (БЕЗ \`\`\`html обёртки, БЕЗ markdown). Используй ТОЛЬКО inline-стили.

ОБЯЗАТЕЛЬНЫЕ СЕКЦИИ ОТЧЁТА:

1. **📊 Резюме** — ключевые метрики карточками (выручка, прибыль, маржа, средний чек). Показывай динамику стрелками ▲▼ и процентами.

2. **💰 Финансовый анализ** — разбивка доходов и расходов. Себестоимость vs операционные расходы. Построй горизонтальную bar-chart диаграмму используя div-элементы с inline-стилями и градиентами.

3. **🏆 ABC-анализ товаров** — таблица топ товаров с цветовой маркировкой групп A/B/C. Группа A = зелёный, B = жёлтый, C = красный.

4. **👥 Анализ игроков** — сегментация (новые, активные, спящие) в виде визуальной диаграммы. Топ игроков таблицей.

5. **💳 Способы оплаты** — визуальная полоса-диаграмма (stacked bar) с цветами: наличные=зелёный, карта=синий, долг=красный, бонусы=оранжевый.

6. **⚠️ Проблемы и риски** — красные зоны: если маржа <70%, рост долгов, падение retention, спящие игроки.

7. **💡 Рекомендации** — 3-5 конкретных, действенных советов по увеличению прибыли, привлечению и удержанию клиентов. Основывай на данных.

ПРАВИЛА ВИЗУАЛИЗАЦИИ:
- Для диаграмм используй div-элементы с inline-стилями: background с linear-gradient, border-radius, ширина в процентах.
- Карточки метрик: display:flex, gap, padding, border-radius:12px, background с полупрозрачными цветами.
- Таблицы: border-collapse, padding в ячейках, чередование строк с background.
- Цвета: рост = #22c55e, падение = #ef4444, нейтрально = #3b82f6, акцент = #a855f7.
- Все шрифты: font-family: -apple-system, system-ui, sans-serif.
- Максимальная ширина контента: 100%.
- НЕ используй внешние скрипты или стили.
- Текст должен быть на РУССКОМ языке.

Будь детальным, используй реальные цифры из данных. Формат чисел: разделитель тысяч — пробел, валюта — ₽.`;
}

function buildChatPrompt(userName: string, context: AnalyticsContext): string {
  return `Ты — аналитик T-POS. Отвечай на вопросы по данным клуба. Обращайся к пользователю по имени: ${userName}. Будь краток и точен. Используй цифры из контекста. Отвечай в формате HTML с inline-стилями для красивого форматирования. Контекст данных:\n${JSON.stringify(context)}`;
}

interface Props {
  context: AnalyticsContext;
  userName: string;
}

export const AiReport = memo(function AiReport({ context, userName }: Props) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setReport(null);

    const systemMsg = {
      role: 'system',
      content: buildReportPrompt(userName),
    };
    const userMsg = {
      role: 'user',
      content: `Сгенерируй подробный аналитический отчёт по следующим данным:\n${JSON.stringify(context, null, 2)}`,
    };

    const text = await callAI([systemMsg, userMsg], context);
    setReport(text);
    setLoading(false);
  }, [context, userName]);

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: question }];
    setChatMessages(newMessages);
    setChatLoading(true);

    const systemMsg = {
      role: 'system',
      content: buildChatPrompt(userName, context),
    };

    const apiMessages = [
      systemMsg,
      ...newMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const answer = await callAI(apiMessages, context);
    setChatMessages([...newMessages, { role: 'assistant', content: answer }]);
    setChatLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [chatInput, chatMessages, chatLoading, context, userName]);

  return (
    <div className="space-y-4">
      {/* Generate report button */}
      <Button
        fullWidth
        size="lg"
        onClick={generateReport}
        loading={loading}
        className="gap-2"
      >
        <Sparkles className="w-4 h-4" />
        {report ? 'Обновить ИИ-отчёт' : 'Сгенерировать ИИ-отчёт'}
      </Button>

      {/* Report */}
      {report && (
        <div className="rounded-xl card overflow-hidden animate-fade-in-up">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-[rgba(var(--c-accent-rgb),0.08)] to-transparent"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--c-accent)]" />
              <span className="text-sm font-semibold text-[var(--c-text)]">ИИ-отчёт</span>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-[var(--c-hint)]" /> : <ChevronDown className="w-4 h-4 text-[var(--c-hint)]" />}
          </button>
          {expanded && (
            <div className="px-3 pb-4 pt-2">
              <div
                className="ai-report-content text-sm text-[var(--c-text)] leading-relaxed overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: report }}
              />
            </div>
          )}
        </div>
      )}

      {/* Chat */}
      <div className="rounded-xl card overflow-hidden">
        <div className="p-3 border-b border-[var(--c-border)] flex items-center gap-2">
          <Bot className="w-4 h-4 text-[var(--c-accent)]" />
          <span className="text-sm font-semibold text-[var(--c-text)]">Спроси T-POS</span>
        </div>

        {chatMessages.length > 0 && (
          <div className="max-h-60 overflow-y-auto px-3 pt-3 space-y-2.5">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-[rgba(var(--c-accent-rgb),0.1)] flex items-center justify-center shrink-0">
                    <Bot className="w-3 h-3 text-[var(--c-accent)]" />
                  </div>
                )}
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${msg.role === 'user'
                    ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)] rounded-tr-sm'
                    : 'bg-[var(--c-surface)] text-[var(--c-text)] rounded-tl-sm'
                  }`}>
                  {msg.role === 'assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-[var(--c-surface)] flex items-center justify-center shrink-0">
                    <User className="w-3 h-3 text-[var(--c-hint)]" />
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-[rgba(var(--c-accent-rgb),0.1)] flex items-center justify-center shrink-0">
                  <Loader2 className="w-3 h-3 text-[var(--c-accent)] animate-spin" />
                </div>
                <div className="px-3 py-2 rounded-xl rounded-tl-sm bg-[var(--c-surface)]">
                  <span className="text-sm text-[var(--c-hint)]">Думаю...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        <div className="p-3 flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder="Например: Кто приносит больше всего прибыли?"
            className="flex-1 px-3 py-2 text-sm rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:ring-1 focus:ring-[rgba(var(--c-accent-rgb),0.3)]"
          />
          <button
            onClick={sendChat}
            disabled={!chatInput.trim() || chatLoading}
            className="w-10 h-10 rounded-xl bg-[var(--c-accent)] flex items-center justify-center text-[var(--c-accent-text)] disabled:opacity-30 active:scale-90 transition-transform shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
