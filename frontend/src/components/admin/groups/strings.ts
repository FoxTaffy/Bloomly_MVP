import { useLangStore } from '@/stores/lang'

// Подписи вкладки «Группы и события». Админка — рабочий инструмент команды, поэтому ru + en;
// остальные языки интерфейса показывают английский.
const S = {
  tabGroups: { ru: 'Группы', en: 'Groups' }, tabEvents: { ru: 'События', en: 'Events' },
  loadFailed: { ru: 'Не удалось загрузить данные', en: 'Could not load data' }, retry: { ru: 'Повторить', en: 'Retry' },

  kGroups: { ru: 'Групп', en: 'Groups' }, kMembers: { ru: 'Участников', en: 'Members' },
  kPosts: { ru: 'Постов в группах', en: 'Group posts' }, kEvents: { ru: 'Событий', en: 'Events' },
  kAttendees: { ru: 'Записей на события', en: 'Event sign-ups' }, kRequests: { ru: 'Заявок на вступление', en: 'Join requests' },
  thisWeek: { ru: 'за неделю', en: 'this week' }, perGroup: { ru: 'в среднем на группу', en: 'avg per group' },
  upcomingShort: { ru: 'предстоящих', en: 'upcoming' }, pastShort: { ru: 'прошедших', en: 'past' },
  publicN: { ru: 'открытых', en: 'public' }, privateN: { ru: 'закрытых', en: 'private' },
  verifiedN: { ru: 'проверенных', en: 'verified' }, nsfwN: { ru: 'NSFW', en: 'NSFW' }, denN: { ru: 'в Dealers Den', en: 'in Dealers Den' },
  topN: { ru: 'в топе', en: 'featured' },

  search: { ru: 'Поиск по названию, адресу или владельцу…', en: 'Search by name, slug or owner…' },
  allTypes: { ru: 'Все типы', en: 'All types' },
  sMembers: { ru: 'По участникам', en: 'By members' }, sGrowth: { ru: 'По приросту за неделю', en: 'By weekly growth' },
  sPosts: { ru: 'По постам', en: 'By posts' }, sEvents: { ru: 'По событиям', en: 'By events' },
  sRating: { ru: 'По рейтингу', en: 'By rating' }, sNewest: { ru: 'Сначала новые', en: 'Newest first' },
  sRequests: { ru: 'По заявкам', en: 'By requests' },
  empty: { ru: 'Группы не найдены', en: 'No groups found' }, emptyEvents: { ru: 'Событий нет', en: 'No events' },

  members: { ru: 'Участники', en: 'Members' }, posts: { ru: 'Посты', en: 'Posts' }, events: { ru: 'События', en: 'Events' },
  rating: { ru: 'Рейтинг', en: 'Rating' }, subscribers: { ru: 'подписчиков', en: 'subscribers' },
  requests: { ru: 'заявок', en: 'requests' }, nextEvent: { ru: 'Ближайшее', en: 'Next' },
  noEvents: { ru: 'нет событий', en: 'no events' }, signups: { ru: 'записей', en: 'sign-ups' },
  created: { ru: 'создана', en: 'created' }, owner: { ru: 'Владелец', en: 'Owner' },
  open: { ru: 'Открыть', en: 'Open' }, ownerProfile: { ru: 'Профиль владельца', en: 'Owner profile' },
  vVerified: { ru: 'Проверена', en: 'Verified' }, vPrivate: { ru: 'Закрытая', en: 'Private' },
  vDonations: { ru: 'Донаты', en: 'Donations' }, vBusiness: { ru: 'Бизнес', en: 'Business' },
  noDescription: { ru: 'Без описания', en: 'No description' },
  prev: { ru: 'Назад', en: 'Back' }, next: { ru: 'Вперёд', en: 'Next' },

  fAll: { ru: 'Все', en: 'All' }, fUpcoming: { ru: 'Предстоящие', en: 'Upcoming' }, fPast: { ru: 'Прошедшие', en: 'Past' },
  going: { ru: 'идут', en: 'going' }, maybe: { ru: 'возможно', en: 'maybe' },
  program: { ru: 'пунктов программы', en: 'programme items' }, tickets: { ru: 'тарифов билетов', en: 'ticket tiers' },
  recurring: { ru: 'Повторяется', en: 'Recurring' }, top: { ru: 'ТОП', en: 'TOP' },
  upcoming: { ru: 'Скоро', en: 'Upcoming' }, past: { ru: 'Прошло', en: 'Past' },
  noLocation: { ru: 'Место не указано', en: 'No location' },
} as const

export type GroupsKey = keyof typeof S

export function useGroupsT() {
  const lang = useLangStore()
  return (key: GroupsKey): string => {
    const row = S[key]
    return lang.currentLang === 'RU' ? row.ru : row.en
  }
}
