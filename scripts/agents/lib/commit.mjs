// Единый стиль коммитов: `type(scope): тема` + тело + трейлер `Build: X.Y.Z`.
export const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'style', 'test', 'build', 'ci', 'chore', 'revert', 'security'];
const HEADER_RE = /^([A-Za-z]+)(?:\(([^)]*)\))?(!)?\s*:\s*(.+)$/;
/** Служебные сообщения git не трогаем. */
const PASSTHROUGH_RE = /^(?:Merge |Revert "|fixup! |squash! |amend! |Initial commit)/;
const MAX_HEADER = 100;

const KEYWORDS = [
  [/(?<![\p{L}])(fix|bug|исправ|ошибк|баг|почин|краш|падени)/iu, 'fix'],
  [/(?<![\p{L}])(refactor|рефактор|перенос|упрост|убра[нл])/iu, 'refactor'],
  [/(?<![\p{L}])(docs?|readme|документ|описани)/iu, 'docs'],
  [/(?<![\p{L}])(test|тест)/iu, 'test'],
  [/(?<![\p{L}])(perf|быстр|оптимиз|ускор)/iu, 'perf'],
  [/(?<![\p{L}])(security|безопасн|уязвим|утечк)/iu, 'security'],
  [/(?<![\p{L}])(feat|add|добав|нов[аоы]|реализ|поддержк)/iu, 'feat'],
];

/** Тип из префикса ветки: fix/support-tickets → fix. */
export function typeFromBranch(branch = '') {
  const m = /^(feat|feature|fix|hotfix|refactor|perf|docs|test|chore|ci|build|security)\//.exec(branch);
  if (!m) return null;
  return m[1] === 'feature' ? 'feat' : m[1] === 'hotfix' ? 'fix' : m[1];
}

/** Область по путям: backend/src/modules/<m>, frontend/src/{components,views,stores}/<x>, иначе верхняя папка. */
export function scopeFromPaths(paths = []) {
  const counts = new Map();
  for (const p of paths) {
    let m;
    let scope = null;
    if ((m = /^backend\/src\/modules\/([^/]+)\//.exec(p))) scope = m[1];
    else if ((m = /^backend\/prisma\//.exec(p))) scope = 'db';
    else if ((m = /^frontend\/src\/(?:components|views|stores|composables)\/(?:admin\/)?([A-Za-z]+)/.exec(p))) scope = m[1].replace(/(?<=[a-z])(?=[A-Z])/g, '-').toLowerCase().replace(/-?(?:view|tab|store|card|modal)$/, '') || null;
    else if (/^frontend\/src\/locales\//.test(p)) scope = 'i18n';
    else if (/^(?:scripts|\.githooks|\.github)\//.test(p)) scope = 'ci';
    else if ((m = /^([^/]+)\//.exec(p))) scope = m[1];
    if (scope) counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // Область называем только когда она явно доминирует: иначе лучше без неё, чем с неверной.
  return top.length && top[0][1] / paths.length >= 0.5 ? top[0][0] : null;
}

export function typeFromPaths(paths = []) {
  if (!paths.length) return null;
  if (paths.every((p) => /\.(md|txt)$|^docs\//.test(p))) return 'docs';
  if (paths.every((p) => /(^|\/)test\/|\.test\./.test(p))) return 'test';
  if (paths.every((p) => /^(?:scripts|\.githooks|\.github)\//.test(p))) return 'ci';
  return null;
}

function normalizeSubject(s) {
  let out = s.trim().replace(/\s+/g, ' ').replace(/[.。]+$/, '');
  // Стиль репозитория — тема со строчной буквы; аббревиатуры (API, JWT) и имена (YooKassa) не трогаем.
  if (/^[A-ZА-ЯЁ][a-zа-яё]/.test(out) && !/^[A-ZА-ЯЁ][a-zа-яё]*[A-ZА-ЯЁ]/.test(out.split(' ')[0])) {
    out = out[0].toLowerCase() + out.slice(1);
  }
  return out;
}

/**
 * @param {{message:string, branch?:string, stagedPaths?:string[], build?:string}} input
 * @returns {{message:string, changed:boolean, notes:string[]}}
 */
export function formatMessage({ message, branch = '', stagedPaths = [] }) {
  const notes = [];
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  // Строки-комментарии git (`# ...`) в сообщение не входят; снимаем их до разбора.
  const body = lines.filter((l) => !l.startsWith('#'));
  while (body.length && !body[0].trim()) body.shift();
  if (!body.length) return { message, changed: false, notes: ['пустое сообщение'] };
  const rawHeader = body.shift().trimEnd();
  if (PASSTHROUGH_RE.test(rawHeader)) return { message, changed: false, notes };

  let type, scope, bang, subject;
  const m = HEADER_RE.exec(rawHeader);
  if (m && TYPES.includes(m[1].toLowerCase())) {
    type = m[1].toLowerCase(); scope = (m[2] ?? '').trim().toLowerCase() || null; bang = !!m[3]; subject = m[4];
  } else {
    subject = m ? m[4] : rawHeader;
    type = typeFromBranch(branch) ?? KEYWORDS.find(([re]) => re.test(subject))?.[1] ?? typeFromPaths(stagedPaths) ?? 'chore';
    scope = null; bang = false;
    notes.push(`тип «${type}» подобран автоматически`);
  }
  if (!scope) scope = scopeFromPaths(stagedPaths);
  subject = normalizeSubject(subject);
  const header = `${type}${scope ? `(${scope})` : ''}${bang ? '!' : ''}: ${subject}`;
  if (header.length > MAX_HEADER) notes.push(`заголовок ${header.length} симв. (> ${MAX_HEADER}) — сократите вручную`);

  // Тело: без хвостовых пробелов, не больше одной пустой строки подряд, ровно одна пустая строка после заголовка.
  const cleaned = [];
  for (const l of body.map((x) => x.trimEnd())) {
    if (!l && !cleaned.length) continue;
    if (!l && cleaned[cleaned.length - 1] === '') continue;
    cleaned.push(l);
  }
  while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop();
  const out = cleaned.length ? `${header}\n\n${cleaned.join('\n')}\n` : `${header}\n`;
  return { message: out, changed: out !== message, notes };
}

/** `BREAKING CHANGE:` в теле или `!` в заголовке. */
export function isBreaking(message) {
  return /^[a-z]+(?:\([^)]*\))?!:/m.test(message) || /^BREAKING[ -]CHANGE:/m.test(message);
}

/** Разбор сообщения для классификаторов. */
export function parseHeader(message) {
  const first = message.split('\n', 1)[0];
  const m = HEADER_RE.exec(first);
  if (!m || !TYPES.includes(m[1].toLowerCase())) return { type: null, scope: null, subject: first.trim(), breaking: isBreaking(message) };
  return { type: m[1].toLowerCase(), scope: (m[2] ?? '').trim().toLowerCase() || null, subject: m[4].trim(), breaking: isBreaking(message) };
}
