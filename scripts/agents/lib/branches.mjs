// Branch Sorter: по типу и области изменения определяет логическую ветку `тип/область`.
import { parseHeader, typeFromPaths, scopeFromPaths } from './commit.mjs';

const PREFIX = {
  feat: 'feat', fix: 'fix', security: 'fix', refactor: 'refactor', perf: 'refactor',
  docs: 'docs', test: 'test', build: 'chore', ci: 'chore', chore: 'chore', style: 'chore', revert: 'chore',
};

export const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/**
 * @param {{message?:string, title?:string, labels?:string[], paths?:string[]}} item коммит, PR или задача
 * @returns {{type:string, area:string, branch:string}}
 */
export function classify({ message, title, labels = [], paths = [] }) {
  const head = parseHeader(message ?? title ?? '');
  let type = head.type;
  if (!type) {
    const label = labels.map((l) => l.toLowerCase());
    type = label.includes('bug') ? 'fix' : label.includes('documentation') ? 'docs' : label.includes('enhancement') ? 'feat' : typeFromPaths(paths) ?? 'chore';
  }
  const area = slug(head.scope) || slug(scopeFromPaths(paths)) || 'misc';
  const prefix = PREFIX[type] ?? 'chore';
  return { type, area, branch: `${prefix}/${area}` };
}

/** Группирует коммиты по целевой ветке, сохраняя порядок внутри группы. */
export function groupByBranch(commits) {
  const groups = new Map();
  for (const c of commits) {
    const { branch } = classify(c);
    if (!groups.has(branch)) groups.set(branch, []);
    groups.get(branch).push(c);
  }
  return groups;
}
