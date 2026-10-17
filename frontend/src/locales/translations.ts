import { ru, type Translation } from './ru';

/**
 * Русский — язык по умолчанию и запасной, он в основной сборке. Остальные языки
 * загружаются отдельными чанками только при выборе: все восемь словарей вместе весили
 * ~900 КБ и грузились каждому посетителю.
 */
export const LANGS = ['RU', 'EN', 'JP', 'CN', 'DE', 'FR', 'ES', 'PT'] as const;
export type Lang = typeof LANGS[number];
export type { Translation };
export { ru };

const loaders: Record<Exclude<Lang, 'RU'>, () => Promise<Translation>> = {
  EN: () => import('./en').then((m) => m.en),
  JP: () => import('./jp').then((m) => m.jp),
  CN: () => import('./cn').then((m) => m.cn),
  DE: () => import('./de').then((m) => m.de),
  FR: () => import('./fr').then((m) => m.fr),
  ES: () => import('./es').then((m) => m.es),
  PT: () => import('./pt').then((m) => m.pt),
};

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

export function loadTranslation(lang: Lang): Promise<Translation> {
  return lang === 'RU' ? Promise.resolve(ru) : loaders[lang]();
}
