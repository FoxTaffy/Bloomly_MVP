#!/usr/bin/env node
// Агент безопасности репозитория. Режимы:
//   --staged            то, что сейчас в индексе (pre-commit)
//   --tree              все файлы под контролем git (HEAD + рабочее дерево)
//   --range A..B        (или `SHA --not --remotes`) добавленные строки коммитов диапазона (CI на push/PR)
//   --history           вся история (разовый аудит перед публикацией)
//   --text -            произвольный текст из stdin (проверка постов/описаний перед публикацией)
// Код выхода 1, если найдено что-либо. Значения секретов в вывод не попадают.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { scanText, isBinary, SKIP_PATH_RE } from './lib/secrets.mjs';

// Коммиты, в которых секрет уже утёк и был перевыпущен (по одному префиксу SHA на строку, `#` — комментарий).
// Они остаются в публичной истории навсегда, поэтому без базы каждая проверка истории падала бы на них.
const BASELINE_FILE = 'scripts/agents/secret-scan.baseline';
const baseline = (() => {
  try { return readFileSync(BASELINE_FILE, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean); } catch { return []; }
})();
const inBaseline = (sha) => !!sha && baseline.some((b) => sha.startsWith(b));

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const root = git(['rev-parse', '--show-toplevel']).trim();
process.chdir(root);

const argv = process.argv.slice(2);
const mode = argv[0];
const findings = [];

function scanFiles(paths, read) {
  for (const p of paths) {
    if (SKIP_PATH_RE.test(p)) continue;
    let buf;
    try { buf = read(p); } catch { continue; }
    if (isBinary(buf) || buf.length > 2_000_000) continue;
    findings.push(...scanText(p, buf.toString('utf8')));
  }
}

/** Разбор unified diff: сканируем только добавленные строки, номера строк берём из заголовков ханков. */
function scanDiff(diff, label) {
  let path = null, line = 0, skip = false, commit = null;
  for (const row of diff.split('\n')) {
    const c = /^commit ([0-9a-f]{40})/.exec(row);
    if (c) { commit = c[1]; path = null; continue; }
    if (row.startsWith('+++ ')) { path = row.slice(4).replace(/^b\//, ''); skip = path === '/dev/null' || SKIP_PATH_RE.test(path) || inBaseline(commit); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(row);
    if (h) { line = Number(h[1]) - 1; continue; }
    if (row.startsWith('+') && !row.startsWith('+++')) {
      line++;
      if (skip || !path) continue;
      for (const f of scanText(path, row.slice(1))) findings.push({ ...f, line, label });
    } else if (!row.startsWith('-')) line++;
  }
}

if (mode === '--staged') {
  const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
  scanFiles(names, (p) => execFileSync('git', ['show', `:${p}`], { maxBuffer: 1 << 26 }));
} else if (mode === '--tree') {
  const names = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  scanFiles(names, (p) => readFileSync(p));
} else if (mode === '--range') {
  const revs = argv.slice(1); // `A..B` или `SHA --not --remotes` (новая ветка)
  if (!revs.length) { console.error('usage: --range A..B'); process.exit(2); }
  scanDiff(git(['log', '-p', '--no-color', '--unified=0', '--diff-filter=ACMR', ...revs]), revs.join(' '));
} else if (mode === '--history') {
  scanDiff(git(['log', '--all', '-p', '--no-color', '--unified=0', '--diff-filter=ACMR']), 'history');
} else if (mode === '--text') {
  findings.push(...scanText(argv[1] === '-' || !argv[1] ? 'stdin.txt' : argv[1], readFileSync(0, 'utf8')));
} else {
  console.error('usage: secret-scan.mjs --staged | --tree | --range A..B | --history | --text -');
  process.exit(2);
}

// Файл .env сообщаем один раз на путь, а не на каждую строку диффа.
const uniq = [...new Map(findings.map((f) => [f.rule === 'env-file' ? `${f.path}:env` : `${f.path}:${f.line}:${f.rule}`, f])).values()];
if (!uniq.length) { console.log('secret-scan: чисто'); process.exit(0); }
console.error(`secret-scan: найдено ${uniq.length} возможн. утечек (значения скрыты):`);
for (const f of uniq.slice(0, 200)) console.error(`  ${f.path}:${f.line}  [${f.rule}]  ${f.preview}`);
console.error('Ложное срабатывание: добавьте в строку комментарий "secret-scan:ignore". Настоящий секрет — отзовите и перевыпустите: удаления из истории недостаточно.');
process.exit(1);
