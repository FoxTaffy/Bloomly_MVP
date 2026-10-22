#!/usr/bin/env node
// Branch Sorter — раскладывает коммиты по логическим веткам `тип/область`.
//   branch-sorter.mjs plan  [A..B]            показать, что куда попадёт (по умолчанию @{upstream}..HEAD)
//   branch-sorter.mjs apply  A..B [--prefix sorted/]   создать ветки: cherry-pick группы поверх A
// Существующие ветки и ваша текущая ветка не меняются: результат всегда уходит в НОВУЮ ветку.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { groupByBranch } from './lib/branches.mjs';

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
const [cmd = 'plan', ...rest] = process.argv.slice(2);
const prefixIdx = rest.indexOf('--prefix');
const prefix = prefixIdx >= 0 ? rest.splice(prefixIdx, 2)[1] : 'sorted/';
let range = rest[0];

if (!range) {
  try { range = `${git(['rev-parse', '--abbrev-ref', '@{upstream}']).trim()}..HEAD`; } catch { range = 'HEAD~20..HEAD'; }
}
const [base] = range.split('..');

function loadCommits() {
  // %x00 — разделитель полей, %x01 — записей: сообщения содержат переводы строк.
  const out = git(['log', '--reverse', '--no-merges', '--format=%H%x00%B%x01', range]);
  return out.split('\x01').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, message] = r.split('\0');
    const paths = git(['show', '--name-only', '--format=', sha]).split('\n').filter(Boolean);
    return { sha, message: message.trim(), paths };
  });
}

const commits = loadCommits();
if (!commits.length) { console.log(`branch-sorter: в ${range} коммитов нет`); process.exit(0); }
const groups = groupByBranch(commits);

console.log(`branch-sorter: ${commits.length} коммит(ов) → ${groups.size} веток (${range})`);
for (const [branch, list] of groups) {
  console.log(`\n  ${prefix}${branch}`);
  for (const c of list) console.log(`    ${c.sha.slice(0, 7)}  ${c.message.split('\n', 1)[0]}`);
}
if (cmd !== 'apply') { console.log('\nЧтобы создать ветки: branch-sorter.mjs apply', range); process.exit(0); }

// apply: отдельный worktree, чтобы не трогать рабочее дерево с чужими правками.
let failed = 0;
for (const [branch, list] of groups) {
  const name = `${prefix}${branch}`;
  try { git(['rev-parse', '--verify', '-q', `refs/heads/${name}`], { stdio: 'pipe' }); console.log(`пропуск ${name}: ветка уже есть`); continue; } catch { /* нет — создаём */ }
  const dir = mkdtempSync(join(tmpdir(), 'sorter-'));
  try {
    git(['worktree', 'add', '-q', '-b', name, dir, base], { stdio: 'pipe' });
    for (const c of list) git(['-C', dir, '-c', 'core.hooksPath=/dev/null', 'cherry-pick', '--allow-empty', '--keep-redundant-commits', c.sha], { stdio: 'pipe' });
    console.log(`создана ${name} (${list.length})`);
  } catch (e) {
    failed++;
    console.error(`конфликт при сборке ${name}: ветка не создана. Коммиты зависят от других групп — разнесите вручную.`);
    try { git(['-C', dir, 'cherry-pick', '--abort'], { stdio: 'pipe' }); } catch { /* уже чисто */ }
    try { git(['worktree', 'remove', '--force', dir], { stdio: 'pipe' }); git(['branch', '-D', name], { stdio: 'pipe' }); } catch { /* */ }
    continue;
  }
  git(['worktree', 'remove', '--force', dir], { stdio: 'pipe' });
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
