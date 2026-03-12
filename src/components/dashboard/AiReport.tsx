import { useState, useCallback, useRef, memo } from 'react';
import {
  Sparkles, Send, Loader2, Bot, User,
  TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle, Lightbulb,
  CreditCard, ChevronDown, Package, Target,
} from 'lucide-react';
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

interface ReportSection {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  metrics?: { label: string; value: string; trend?: 'up' | 'down' | 'neutral' }[];
  details: string;
  severity?: 'success' | 'warning' | 'danger' | 'info';
  actions?: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sections?: ReportSection[];
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

function parseAIResponse(text: string): ReportSection[] {
  // Try to parse JSON response
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.sections && Array.isArray(parsed.sections)) {
      return parsed.sections.map((s: Record<string, unknown>, i: number) => ({
        id: `section-${i}`,
        emoji: (s.emoji as string) || '📊',
        title: (s.title as string) || 'Раздел',
        summary: (s.summary as string) || '',
        metrics: Array.isArray(s.metrics) ? s.metrics : undefined,
        details: (s.details as string) || '',
        severity: (s.severity as string) || 'info',
        actions: Array.isArray(s.actions) ? s.actions : undefined,
      }));
    }
  } catch {
    // Not JSON — convert plain text to sections
  }

  // Fallback: split text by double newline or emoji headers into cards
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  if (blocks.length <= 1) {
    return [{ id: 'full', emoji: '📊', title: 'ИИ-анализ', summary: text.slice(0, 100) + '...', details: text, severity: 'info' }];
  }

  return blocks.slice(0, 8).map((block, i) => {
    const lines = block.trim().split('\n');
    const firstLine = lines[0].replace(/^[#*\s]+/, '').trim();
    const emojiMatch = firstLine.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
    const emoji = emojiMatch ? emojiMatch[0] : ['📊', '💰', '🏆', '👥', '💳', '⚠️', '💡', '📈'][i] || '📊';
    const title = firstLine.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').replace(/\*\*/g, '').trim();
    const details = lines.slice(1).join('\n').trim();
    return {
      id: `block-${i}`,
      emoji,
      title: title || `Раздел ${i + 1}`,
      summary: details.split('\n')[0]?.slice(0, 80) || title,
      details: details || firstLine,
      severity: 'info' as const,
    };
  });
}

const SECTION_ICONS: Record<string, typeof DollarSign> = {
  '📊': Target, '💰': DollarSign, '🏆': Package, '👥': Users,
  '💳': CreditCard, '⚠️': AlertTriangle, '💡': Lightbulb, '📈': TrendingUp,
};

const SEVERITY_COLORS: Record<string, string> = {
  success: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
  warning: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
  danger: 'from-red-500/10 to-red-500/5 border-red-500/20',
  info: 'from-[rgba(var(--c-accent-rgb),0.08)] to-transparent border-[rgba(var(--c-accent-rgb),0.1)]',
};

function ReportCard({ section }: { section: ReportSection }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = SECTION_ICONS[section.emoji] || Target;
  const colors = SEVERITY_COLORS[section.severity || 'info'];

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${colors} overflow-hidden transition-all active:scale-[0.98]`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        <div className="w-9 h-9 rounded-lg bg-[var(--c-surface)] flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-[var(--c-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--c-text)] leading-tight">{section.title}</p>
          <p className="text-xs text-[var(--c-hint)] mt-0.5 line-clamp-2">{section.summary}</p>
          {section.metrics && section.metrics.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {section.metrics.slice(0, 3).map((m, i) => (
                <div key={i} className="flex items-center gap-1 text-[11px]">
                  {m.trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                  {m.trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500" />}
                  <span className="text-[var(--c-hint)]">{m.label}:</span>
                  <span className="font-bold text-[var(--c-text)]">{m.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-[var(--c-hint)] shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-[var(--c-border)]">
          <div className="pt-2 text-xs text-[var(--c-text)] leading-relaxed whitespace-pre-wrap">
            {section.details}
          </div>
          {section.actions && section.actions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--c-border)]">
              <p className="text-[11px] font-semibold text-[var(--c-hint)] mb-2">Рекомендуемые действия</p>
              <ul className="space-y-1.5">
                {section.actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[var(--c-text)]">
                    <span className="text-emerald-500 shrink-0">•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildReportPrompt(userName: string): string {
  return `Ты — опытный бизнес-аналитик POS-системы T-POS для развлекательных заведений (боулинг, бильярд, клубы).
Обращайся к пользователю по имени: ${userName}.

ЗАДАЧА: Сгенерировать глубокий аналитический отчёт в формате JSON.

ФОРМАТ ОТВЕТА — строго JSON (без markdown, без \`\`\`):
{
  "sections": [
    {
      "emoji": "📊",
      "title": "Название секции",
      "summary": "Одно предложение — ключевой вывод",
      "metrics": [
        { "label": "Метрика", "value": "125 000₽", "trend": "up" }
      ],
      "details": "Подробный анализ 4-6 предложений. Конкретные цифры, сравнения с прошлым периодом, выводы.",
      "severity": "success|warning|danger|info",
      "actions": ["Действие 1", "Действие 2"]
    }
  ]
}

ОБЯЗАТЕЛЬНЫЕ СЕКЦИИ (8-10 штук):
1. 📊 Исполнительное резюме — 3 главных вывода периода, общий вердикт (успех/внимание/тревога)
2. 💰 Выручка и динамика — сравнение с прошлым периодом, % роста/падения, средний чек
3. 📈 Прибыль и маржа — чистая прибыль, маржинальность, себестоимость vs выручка
4. 🏆 Топ-5 товаров — что продаётся лучше всего, выручка по позициям, ABC-группы
5. 👥 Клиенты — новые/активные/спящие, retention, топ-5 по тратам
6. 💳 Способы оплаты — разбивка наличные/карта/долг/бонусы, тренды
7. ⚠️ Риски и проблемы — долги (если есть), низкая маржа, спящие клиенты
8. 💡 Рекомендации — 4-5 конкретных действий для роста (что сделать на этой неделе)
9. 🎯 Цели на следующий период — 2-3 измеримых цели на основе данных
10. 📉 Антирейтинг — что не продаётся, залежавшиеся позиции (если данные есть)

ПРАВИЛА:
- severity: success если показатели хорошие, warning если на грани нормы, danger если проблема
- metrics: 2-4 для каждой секции, trend: up/down/neutral
- details: Только текст. Конкретные числа. Сравнения (было X, стало Y, +Z%)
- actions: 1-3 конкретных действия для секций с проблемами или возможностями
- Формат чисел: пробел-разделитель (125 000), валюта ₽
- Будь конкретен: называй товары, суммы, проценты
- Ответ СТРОГО JSON. Никакого текста до/после.`;
}

function buildChatPrompt(userName: string, context: AnalyticsContext): string {
  return `Ты — ИИ-ассистент T-POS. Обращайся к пользователю по имени: ${userName}.
Отвечай кратко и полезно. Используй реальные цифры. Не используй таблицы и диаграммы.
Контекст:\n${JSON.stringify(context)}`;
}

interface Props {
  context: AnalyticsContext;
  userName: string;
}

export const AiReport = memo(function AiReport({ context, userName }: Props) {
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setSections([]);

    const systemMsg = { role: 'system', content: buildReportPrompt(userName) };
    const userMsg = { role: 'user', content: `Аналитика:\n${JSON.stringify(context, null, 2)}` };

    const text = await callAI([systemMsg, userMsg], context);
    const parsed = parseAIResponse(text);
    setSections(parsed);
    setLoading(false);
  }, [context, userName]);

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: question }];
    setChatMessages(newMessages);
    setChatLoading(true);

    const systemMsg = { role: 'system', content: buildChatPrompt(userName, context) };
    const apiMessages = [systemMsg, ...newMessages.map((m) => ({ role: m.role, content: m.content }))];
    const answer = await callAI(apiMessages, context);

    setChatMessages([...newMessages, { role: 'assistant', content: answer }]);
    setChatLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [chatInput, chatMessages, chatLoading, context, userName]);

  return (
    <div className="space-y-4">
      {/* Generate report button */}
      <Button fullWidth size="lg" onClick={generateReport} loading={loading} className="gap-2">
        <Sparkles className="w-4 h-4" />
        {sections.length > 0 ? 'Обновить отчёт' : 'Сгенерировать ИИ-отчёт'}
      </Button>

      {/* Report cards */}
      {sections.length > 0 && (
        <div className="space-y-2 animate-fade-in-up">
          {sections.map((section) => (
            <ReportCard key={section.id} section={section} />
          ))}
        </div>
      )}

      {/* Chat */}
      <div className="rounded-xl card overflow-hidden">
        <div className="p-3 border-b border-[var(--c-border)] flex items-center gap-2">
          <Bot className="w-4 h-4 text-[var(--c-accent)]" />
          <span className="text-sm font-semibold text-[var(--c-text)]">Спроси T-POS</span>
        </div>

        {chatMessages.length > 0 && (
          <div className="max-h-72 overflow-y-auto px-3 pt-3 space-y-2.5">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-[rgba(var(--c-accent-rgb),0.1)] flex items-center justify-center shrink-0">
                    <Bot className="w-3 h-3 text-[var(--c-accent)]" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${msg.role === 'user'
                    ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)] rounded-tr-sm'
                    : 'bg-[var(--c-surface)] text-[var(--c-text)] rounded-tl-sm'
                  }`}>
                  {msg.content}
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
            placeholder="Например: Кто главный должник?"
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
