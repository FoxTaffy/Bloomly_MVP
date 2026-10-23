// Тематика группы: список зависит от типа группы. Меняется не чаще раза в 30 дней.
// Для news и brand тематики нет — там своя рубрика (см. groupRubrics.ts).
// Должно совпадать с GROUP_TOPICS в backend/src/modules/groups/service.ts.

type TopicOption = { value: string; label: string }

const COMMON_TAIL: TopicOption[] = [{ value: 'other', label: 'Другое' }]

export const GROUP_TOPIC_OPTIONS: Record<string, TopicOption[]> = {
  creative: [
    { value: 'artist', label: 'Художник' },
    { value: 'fursuit_maker', label: 'Фурсьют-мейкер' },
    { value: 'craftsman', label: 'Мастер ручной работы' },
    { value: 'sculptor_3d', label: '3D-моделлер / скульптор' },
    { value: 'animator', label: 'Аниматор' },
    { value: 'writer', label: 'Писатель' },
    { value: 'musician', label: 'Музыкант / звукорежиссёр' },
    { value: 'photographer', label: 'Фотограф / видеограф' },
    { value: 'cosplayer', label: 'Косплеер' },
    { value: 'developer', label: 'Разработчик' },
    ...COMMON_TAIL,
  ],
  shop: [
    { value: 'fursuits', label: 'Фурсьюты и части' },
    { value: 'art_merch', label: 'Арт и мерч' },
    { value: 'accessories', label: 'Аксессуары и украшения' },
    { value: 'props', label: 'Реквизит и костюмы' },
    { value: 'print', label: 'Печать и стикеры' },
    { value: 'materials', label: 'Материалы для творчества' },
    ...COMMON_TAIL,
  ],
  event: [
    { value: 'convention', label: 'Конвенция' },
    { value: 'meetup', label: 'Слёт / встреча' },
    { value: 'fursuit_walk', label: 'Фурсьют-прогулка / парад' },
    { value: 'party', label: 'Вечеринка' },
    { value: 'festival', label: 'Фестиваль / ярмарка' },
    { value: 'workshop', label: 'Мастер-класс' },
    { value: 'charity', label: 'Благотворительность' },
    ...COMMON_TAIL,
  ],
  community: [
    { value: 'fandom', label: 'Фандом' },
    { value: 'art', label: 'Арт' },
    { value: 'fursuit', label: 'Фурсьюты' },
    { value: 'cosplay', label: 'Косплей' },
    { value: 'gaming', label: 'Гейминг' },
    { value: 'music', label: 'Музыка' },
    { value: 'dev', label: 'Разработка' },
    { value: 'writing', label: 'Литература' },
    { value: 'local', label: 'Городское / региональное' },
    ...COMMON_TAIL,
  ],
  static: [
    { value: 'art', label: 'Арт' },
    { value: 'fursuit', label: 'Фурсьюты' },
    { value: 'cosplay', label: 'Косплей' },
    { value: 'fandom', label: 'Фандом' },
    { value: 'dev', label: 'Разработка' },
    { value: 'music', label: 'Музыка' },
    { value: 'writing', label: 'Литература' },
    ...COMMON_TAIL,
  ],
}

// Значения прежнего общего списка категорий — у старых групп они могли остаться
const LEGACY_LABELS: Record<string, string> = {
  art: 'Арт', cosplay: 'Косплей', fandom: 'Фандом', dev: 'Разработка', music: 'Музыка',
  fursuit: 'Фурсьюты', writing: 'Литература', events: 'Ивенты', other: 'Другое',
}

export function topicOptionsFor(type: string | undefined | null): TopicOption[] {
  return (type && GROUP_TOPIC_OPTIONS[type]) || []
}

/** Список для выбора; текущее значение, которого уже нет в списке, остаётся выбираемым. */
export function topicSelectOptions(type: string | undefined | null, current: string): TopicOption[] {
  const list = topicOptionsFor(type)
  if (!current || list.some((o) => o.value === current)) return list
  return [{ value: current, label: LEGACY_LABELS[current] ?? current }, ...list]
}

export function topicLabel(type: string | undefined | null, value: string | null | undefined): string {
  if (!value) return ''
  return topicOptionsFor(type).find((o) => o.value === value)?.label ?? LEGACY_LABELS[value] ?? value
}
