/** Название уровня для уведомлений (на клиенте то же самое переведено в локалях bugHunterLvl*) */
export const BUG_HUNTER_LEVEL_NAMES: Record<BugHunterProgress['levelKey'], string> = {
  none: '', lvl1: 'LVL 1', lvl2: 'LVL 2', hacker: 'Хакер',
};

/**
 * Достижение «Охота на баги»: уровень зависит от числа подтверждённых или исправленных баг-репортов.
 * Пороги живут здесь, чтобы профиль получал уже посчитанный прогресс, а не дублировал их на клиенте.
 */
export const BUG_HUNTER_LEVELS = [
  { level: 1, key: 'lvl1', min: 10 },
  { level: 2, key: 'lvl2', min: 25 },
  { level: 3, key: 'hacker', min: 50 },
] as const;

export interface BugHunterProgress {
  count: number;
  /** 0 — ещё нет подтверждённых багов; 3 — финальный статус «Хакер» */
  level: 0 | 1 | 2 | 3;
  levelKey: 'none' | 'lvl1' | 'lvl2' | 'hacker';
  /** Сколько багов нужно для следующего уровня; null, когда достигнут «Хакер» */
  nextTarget: number | null;
  /** Порог текущего уровня — начало отрезка, по которому считается полоска прогресса */
  currentMin: number;
}

export function bugHunterProgress(rawCount: number): BugHunterProgress {
  const count = Math.max(0, Math.floor(rawCount) || 0);
  let current: (typeof BUG_HUNTER_LEVELS)[number] | null = null;
  for (const l of BUG_HUNTER_LEVELS) if (count >= l.min) current = l;
  const next = BUG_HUNTER_LEVELS.find(l => count < l.min) ?? null;
  return {
    count,
    level: (current?.level ?? 0) as BugHunterProgress['level'],
    levelKey: current?.key ?? 'none',
    nextTarget: next?.min ?? null,
    currentMin: current?.min ?? 0,
  };
}
