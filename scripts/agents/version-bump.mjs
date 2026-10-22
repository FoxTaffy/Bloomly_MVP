#!/usr/bin/env node
// pre-commit: поднимает версию сборки от версии в HEAD, поэтому неудавшиеся попытки коммита её не накручивают.
//   BUMP=minor|major git commit …   — для фич и крупных релизов (по умолчанию patch)
//   node scripts/agents/version-bump.mjs [patch|minor|major]   — вручную
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { BUILD_FILE, API_FILE, parseVersion, bump, formatVersion, withVersion } from './lib/version.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const root = git('rev-parse', '--show-toplevel');
process.chdir(root);
const gitDir = git('rev-parse', '--git-dir');

// Слияния, cherry-pick и rebase повторяют уже учтённые изменения — версию не трогаем.
if (['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'].some((f) => existsSync(`${gitDir}/${f}`))) process.exit(0);

const level = process.argv[2] ?? process.env.BUMP ?? 'patch';
if (!['patch', 'minor', 'major'].includes(level)) { console.error(`version-bump: неизвестный уровень «${level}»`); process.exit(2); }

const staged = git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean);
const meaningful = staged.filter((p) => p !== BUILD_FILE && p !== API_FILE);
if (!meaningful.length && process.argv[2] === undefined) process.exit(0); // нечего версионировать

function headText(path) {
  try { return git('show', `HEAD:${path}`); } catch { return null; } // первый коммит
}

function apply(path, lvl) {
  const current = readFileSync(path, 'utf8');
  const base = parseVersion(headText(path) ?? current);
  const next = bump(base, lvl);
  writeFileSync(path, withVersion(current, next));
  // В индекс идёт только строка версии: чужие несохранённые правки того же файла (зависимости и т.п.) в коммит не попадают.
  const indexed = withVersion(git('show', `:${path}`) + '\n', next);
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { input: indexed, encoding: 'utf8' }).trim();
  execFileSync('git', ['update-index', '--cacheinfo', `100644,${blob},${path}`]);
  return formatVersion(next);
}

const build = apply(BUILD_FILE, level);
// API версионируем, только если в коммите есть бэкенд.
const api = meaningful.some((p) => p.startsWith('backend/')) ? apply(API_FILE, level === 'patch' ? 'patch' : level) : null;
console.log(`version-bump: сайт ${build}${api ? `, API ${api}` : ''}`);
