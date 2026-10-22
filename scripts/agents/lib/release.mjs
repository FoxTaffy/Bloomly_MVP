// Release Notes agent: определяет масштаб изменений и собирает публичный текст для Discussions.
import { parseHeader } from './commit.mjs';
import { scanText } from './secrets.mjs';

/** Фича считается крупной обновлением, если есть feat-коммит и затронуто не меньше стольких файлов. */
export const FEATURE_MIN_FILES = 6;

const SECTIONS = [
  { types: ['feat'], title: '✨ Новое' },
  { types: ['fix'], title: '🛠 Исправлено' },
  { types: ['perf'], title: '⚡ Быстрее' },
];

const SCOPE_NAMES = {
  orders: 'Заказы', groups: 'Группы', 'dealers-den': 'Dealers Den', shop: 'Магазин', payments: 'Оплата', wallet: 'Кошелёк',
  messages: 'Сообщения', posts: 'Публикации', notifications: 'Уведомления', verification: 'Верификация', admin: 'Админ-панель',
  auth: 'Вход', i18n: 'Переводы', support: 'Поддержка', stories: 'Истории', users: 'Профили', media: 'Медиа',
};

/**
 * @param {{message:string, paths:string[]}[]} commits
 * @returns {{scale:'major'|'feature'|'patch', feats:number, fixes:number, files:number, breaking:boolean}}
 */
export function measure(commits) {
  const files = new Set();
  let feats = 0, fixes = 0, breaking = false;
  for (const c of commits) {
    const h = parseHeader(c.message);
    if (h.type === 'feat') feats++;
    if (h.type === 'fix') fixes++;
    if (h.breaking) breaking = true;
    for (const p of c.paths ?? []) files.add(p);
  }
  const scale = breaking ? 'major' : feats > 0 && files.size >= FEATURE_MIN_FILES ? 'feature' : 'patch';
  return { scale, feats, fixes, files: files.size, breaking };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Детерминированный текст — основной вариант; LLM только полирует его. */
export function compose({ commits, version, scale, date = new Date().toISOString().slice(0, 10) }) {
  const parsed = commits.map((c) => ({ ...parseHeader(c.message), message: c.message }));
  const hardened = parsed.some((p) => p.type === 'security');
  const lines = [];
  lines.push(scale === 'major' ? `## 🌸 Bloomly ${version}: большое обновление` : `## 🌸 Bloomly ${version}`, '');
  for (const sec of SECTIONS) {
    const items = parsed.filter((p) => sec.types.includes(p.type));
    if (!items.length) continue;
    lines.push(`### ${sec.title}`, '');
    for (const it of items.slice(0, 25)) {
      const area = it.scope ? SCOPE_NAMES[it.scope] ?? cap(it.scope) : null;
      lines.push(`- ${area ? `**${area}:** ` : ''}${it.subject}`);
    }
    if (items.length > 25) lines.push(`- …и ещё ${items.length - 25}`);
    lines.push('');
  }
  // Подробности об уязвимостях публично не раскрываем — только факт.
  if (hardened) lines.push('### 🔒 Безопасность', '', '- Усилили защиту аккаунтов и данных.', '');
  lines.push(`<sub>Сборка ${version} · ${date}</sub>`, '', `<!-- bloomly-release:${version} -->`);
  return lines.join('\n');
}

export function titleFor({ commits, version, scale }) {
  const first = commits.map((c) => parseHeader(c.message)).find((h) => h.type === 'feat');
  const head = first?.subject ? `: ${cap(first.subject)}` : scale === 'major' ? ': большое обновление' : '';
  const full = `Bloomly ${version}${head}`;
  return full.length <= 100 ? full : `${full.slice(0, 99).replace(/\s+\S*$/, '')}…`;
}

/** Публичный текст не должен содержать секретов и внутренних путей. */
export function assertPublicSafe(text) {
  const leaks = scanText('release-notes.md', text);
  if (leaks.length) throw new Error(`в тексте релиза найден возможный секрет (${leaks[0].rule}) — публикация остановлена`);
  if (/(?:^|[\s`(])(?:\/var\/www|\/root\/|backend\/src|frontend\/src)\//.test(text)) throw new Error('в тексте релиза внутренние пути — публикация остановлена');
}

/** Необязательная полировка через Claude: ответ принимается, только если прошёл те же проверки. */
export async function polish(text, { apiKey, model = 'claude-sonnet-5-5', fetchImpl = fetch } = {}) {
  if (!apiKey) return text;
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: 'Ты редактор заметок об обновлении соцсети Bloomly для пользователей. Перепиши текст живо и дружелюбно по-русски, коротко. Сохрани структуру Markdown, заголовок первого уровня «##», все факты и HTML-комментарий в конце. Ничего не выдумывай, не добавляй пути к файлам, названия внутренних сервисов, ключи и технические детали реализации.',
        messages: [{ role: 'user', content: text }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return text;
    const data = await res.json();
    const out = data?.content?.find?.((b) => b.type === 'text')?.text?.trim();
    if (!out || out.length < 80 || out.length > 6000 || !out.includes('bloomly-release:')) return text;
    assertPublicSafe(out);
    return out;
  } catch {
    return text;
  }
}
