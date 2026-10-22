#!/usr/bin/env node
// commit-msg: приводит сообщение к единому стилю, добавляет трейлер Build и не пускает секреты в текст коммита.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { formatMessage } from './lib/commit.mjs';
import { scanText } from './lib/secrets.mjs';
import { BUILD_FILE, API_FILE, parseVersion, formatVersion } from './lib/version.mjs';

const file = process.argv[2];
if (!file) process.exit(0);
const git = (...args) => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

const original = readFileSync(file, 'utf8');
const leaks = scanText('commit-message.txt', original);
if (leaks.length) {
  console.error('commit-msg: в тексте коммита похоже на секрет — коммит отменён:');
  for (const l of leaks) console.error(`  строка ${l.line} [${l.rule}] ${l.preview}`);
  process.exit(1);
}

// Файлы версий поднимает сам хук — на выбор типа и области они влиять не должны.
const staged = git('diff', '--cached', '--name-only', '-z').split('\0').filter((p) => p && p !== BUILD_FILE && p !== API_FILE);
const { message, changed, notes } = formatMessage({ message: original, branch: git('rev-parse', '--abbrev-ref', 'HEAD'), stagedPaths: staged });
if (changed) writeFileSync(file, message);
for (const n of notes) console.error(`commit-msg: ${n}`);

// Build — версия, которая попадёт в этот коммит (pre-commit уже положил её в индекс).
const pkg = git('show', `:${BUILD_FILE}`);
if (pkg && !/^(?:Merge |Revert ")/.test(message)) {
  try {
    const build = formatVersion(parseVersion(pkg));
    execFileSync('git', ['interpret-trailers', '--in-place', '--if-exists', 'replace', '--trailer', `Build: ${build}`, file]);
  } catch { /* версия не определилась — коммит без трейлера лучше отказа */ }
}
