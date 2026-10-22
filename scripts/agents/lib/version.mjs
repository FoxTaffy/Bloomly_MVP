// Номер сборки = версия фронтенда (frontend/package.json): её показывает шапка сайта и трейлер `Build:` в коммитах.
export const BUILD_FILE = 'frontend/package.json';
export const API_FILE = 'backend/package.json';
const VERSION_RE = /("version"\s*:\s*")(\d+)\.(\d+)\.(\d+)(")/;

export function parseVersion(text) {
  const m = VERSION_RE.exec(text);
  if (!m) throw new Error('version не найдена в package.json');
  return { major: +m[2], minor: +m[3], patch: +m[4] };
}

export const formatVersion = (v) => `${v.major}.${v.minor}.${v.patch}`;

/** @param {'major'|'minor'|'patch'} level */
export function bump(v, level = 'patch') {
  if (level === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
  if (level === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 };
  return { ...v, patch: v.patch + 1 };
}

export function withVersion(text, v) {
  return text.replace(VERSION_RE, `$1${formatVersion(v)}$5`);
}
