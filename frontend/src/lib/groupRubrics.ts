// Rubrics: type-specific sub-categories for news and brand groups.
// Shared by the create-group modal and group settings so both offer the same choices.
// Must match GROUP_RUBRICS in backend/src/modules/groups/service.ts.

export const GROUP_RUBRIC_OPTIONS: Record<'news' | 'brand', { value: string; label: string }[]> = {
  news: [
    { value: 'general', label: 'Общие' },
    { value: 'fandom', label: 'Фандом' },
    { value: 'tech', label: 'Технологии' },
    { value: 'art', label: 'Арт' },
    { value: 'events', label: 'Афиша' },
    { value: 'gaming', label: 'Гейминг' },
  ],
  brand: [
    { value: 'studio', label: 'Студия' },
    { value: 'convention', label: 'Конвенция' },
    { value: 'agency', label: 'Агентство' },
    { value: 'publisher', label: 'Издательство' },
    { value: 'service', label: 'Сервис' },
    { value: 'other', label: 'Другое' },
  ],
}

export function rubricOptionsFor(type: string | undefined | null): { value: string; label: string }[] {
  if (type === 'news' || type === 'brand') return GROUP_RUBRIC_OPTIONS[type]
  return []
}

export const DEFAULT_RUBRIC: Record<'news' | 'brand', string> = { news: 'general', brand: 'studio' }
