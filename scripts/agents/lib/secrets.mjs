// Сканер секретов для публичного репозитория. Без зависимостей: работает и в git-хуке, и в GitHub Actions.
// Находка никогда не содержит само значение секрета — только маску, чтобы отчёт не стал новой утечкой.

/** Правила по формату токена. `id` попадает в отчёт и в allowlist. */
export const RULES = [
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/ },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { id: 'stripe-key', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}/ },
  { id: 'telegram-bot-token', re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'url-credentials', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/'"`]{1,64}:([^\s:@/'"`$<>{}()]{6,})@[^\s/'"`]+/i, group: 1 },
];

/** Присваивание вида `password = "значение"` / `SECRET_KEY: значение` — значение проверяется отдельно. */
const ASSIGNMENT_RE = /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key|credential|shop[_-]?key)[A-Za-z0-9_.-]*)\s*[:=]\s*(['"`]?)([^\s'"`,;)}\]]{8,})\2/gi;

/** Значения, которые заведомо не секрет: плейсхолдеры, ссылки на переменные, типы, пустышки. */
const PLACEHOLDER_RE = /^(?:\$\{?[A-Za-z_]|<.*>$|\{\{|%[A-Za-z(]|process\.env|import\.meta|env\.|config\.|request\.|req\.|body\.|this\.|self\.|args\.|params\.|data\.|user\.|payload\.|options\.|ctx\.|state\.)/;
const PLACEHOLDER_WORDS = /(?:your|example|changeme|change_me|placeholder|xxxx|\*{3,}|dummy|sample|fake|test|todo|secret_here|password_here|redacted|undefined|null|true|false|string|number)/i;

/** Файлы, где ключи — часть содержимого по определению или шум. */
export const SKIP_PATH_RE = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|node_modules\/|dist\/|\.next\/|.*\.(?:png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|mp[34]|webm|pdf|zip|gz|tgz|lock|map|wasm|min\.js))$/i;
/** Сам сканер содержит образцы паттернов — его тесты и правила не проверяем. */
const SELF_RE = /^(?:scripts\/agents\/lib\/secrets\.mjs|backend\/test\/secret-scan\.test\.ts|scripts\/agents\/test\/.*)$/;
/** Переменные окружения в самих файлах с секретами: .env коммитить нельзя вообще. */
const ENV_FILE_RE = /(?:^|\/)\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?$/;

export function shannonEntropy(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

export function mask(value) {
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 3)}…${value.slice(-2)} (${value.length} симв.)`;
}

/** Тесты и сиды используют заведомо вымышленные пароли — правило присваивания там только шумит. */
const FIXTURE_PATH_RE = /(?:^|\/)(?:test|tests|__tests__|e2e|fixtures)\/|(?:^|\/)seed[\w.-]*\.[cm]?[jt]s$|\.(?:test|spec)\.[cm]?[jt]sx?$/;

function looksLikeSecretValue(v) {
  if (/^https?:|[()[\]=]/.test(v)) return false; // URL и вызовы функций — не значение секрета
  if (PLACEHOLDER_RE.test(v) || PLACEHOLDER_WORDS.test(v)) return false;
  if (/^[./\\]/.test(v) || /^[a-z]+(?:[A-Z][a-z]+)+$/.test(v)) return false; // пути, camelCase-идентификаторы
  if (/^[A-Za-z_]+(?:\.[A-Za-z_]+)+$/.test(v)) return false; // a.b.c — обращение к полю
  if (/^[A-Z][A-Z0-9_]+$/.test(v)) return false; // ИМЯ_КОНСТАНТЫ
  if (/^[a-z]+(?:[-_][a-z]+)+$/.test(v)) return false; // kebab/snake слова: «reset-password-token»
  return shannonEntropy(v) >= 3.2 && /\d/.test(v) && /[A-Za-z]/.test(v);
}

/** Построчная пометка `secret-scan:ignore` — для осознанных исключений. */
const IGNORE_MARK = 'secret-scan:ignore';

/**
 * @param {string} path путь относительно корня репозитория
 * @param {string} text содержимое файла
 * @returns {{path:string,line:number,rule:string,preview:string}[]}
 */
export function scanText(path, text) {
  if (SELF_RE.test(path) || SKIP_PATH_RE.test(path)) return [];
  const found = [];
  if (ENV_FILE_RE.test(path)) {
    found.push({ path, line: 1, rule: 'env-file', preview: 'файл .env нельзя публиковать' });
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 2000 || line.includes(IGNORE_MARK)) continue;
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const value = m[rule.group ?? 0];
      if (rule.id === 'url-credentials' && !looksLikeSecretValue(value)) continue;
      found.push({ path, line: i + 1, rule: rule.id, preview: mask(value) });
    }
    if (FIXTURE_PATH_RE.test(path)) continue;
    ASSIGNMENT_RE.lastIndex = 0;
    let a;
    while ((a = ASSIGNMENT_RE.exec(line))) {
      if (looksLikeSecretValue(a[3]) && !found.some((f) => f.line === i + 1 && f.path === path)) {
        found.push({ path, line: i + 1, rule: `assignment:${a[1].toLowerCase()}`, preview: mask(a[3]) });
      }
    }
  }
  return found;
}

export function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}
