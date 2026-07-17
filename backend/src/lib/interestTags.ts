/**
 * Maps the declared "Interests" (chosen at onboarding / edited in Settings — see
 * frontend/src/lib/interests.ts for the canonical option list) to the hashtag/keyword terms
 * that feed ranking actually understands. Declared interests otherwise never touch the feed:
 * posts are tagged/written in English hashtags or mixed RU/EN text, not in these RU category
 * labels, so without this map "Interests" would be cosmetic-only.
 */
export const INTEREST_TAG_MAP: Record<string, string[]> = {
  'Рисование':              ['art', 'арт', 'рисование', 'drawing', 'illustration', 'иллюстрация'],
  'Анимация':                ['animation', 'анимация', 'animated'],
  'Комиксы':                 ['comics', 'comic', 'комикс', 'комиксы'],
  'Написание историй':       ['writing', 'story', 'stories', 'рассказ', 'история', 'fiction'],
  'Поэзия':                  ['poetry', 'poem', 'поэзия', 'стихи'],
  'Видеоигры':               ['gaming', 'games', 'game', 'игры', 'видеоигры'],
  'RPG':                     ['rpg', 'ролевые', 'ролевая'],
  'Аниме':                   ['anime', 'аниме'],
  'Косплей':                 ['cosplay', 'косплей'],
  'Музыка':                  ['music', 'музыка'],
  'Танцы':                   ['dance', 'dancing', 'танцы'],
  'Программирование':        ['code', 'coding', 'programming', 'dev', 'программирование', 'разработка'],
  'Технологии':              ['tech', 'technology', 'технологии'],
  'Скульптура':              ['sculpture', 'скульптура'],
  'Вязание/Шитьё':           ['knitting', 'sewing', 'вязание', 'шитьё', 'шитье'],
  'Фотография':              ['photography', 'photo', 'фото', 'фотография'],
  'Видеосъёмка':             ['video', 'videography', 'видео', 'видеосъёмка', 'видеосъемка'],
  'Кулинария':               ['cooking', 'food', 'recipe', 'кулинария', 'рецепт', 'еда'],
  'Природа':                 ['nature', 'природа'],
  'Животные':                ['animals', 'pets', 'животные', 'питомцы'],
  'Фурсьюты':                ['fursuit', 'fursuits', 'фурсьют', 'фурсьюты', 'fursuiting'],
  'Создание костюмов':       ['costume', 'costuming', 'костюм', 'костюмы'],
  'DIY':                     ['diy', 'сделай сам', 'handmade'],
  'Научная фантастика':      ['scifi', 'sciencefiction', 'фантастика'],
  'Фэнтези':                 ['fantasy', 'фэнтези'],
  'D&D / Настольные игры':   ['dnd', 'boardgames', 'настолки', 'настольные'],
  'Кино':                    ['movie', 'movies', 'film', 'кино'],
  'Мультфильмы':             ['cartoon', 'cartoons', 'мультфильм', 'мультики'],
  'Стриминг':                ['stream', 'streaming', 'стрим', 'стримы'],
  'Спорт':                   ['sport', 'sports', 'спорт'],
  'Фитнес':                  ['fitness', 'фитнес'],
  'Путешествия':             ['travel', 'путешествия'],
  'Чтение':                  ['reading', 'books', 'book', 'чтение', 'книги'],
  'Астрономия':              ['astronomy', 'space', 'космос', 'астрономия'],
};

/** Flattens a user's declared interests into the term set used to boost matching posts. */
export function interestsToTerms(interests: string[]): Set<string> {
  const out = new Set<string>();
  for (const interest of interests) {
    for (const term of INTEREST_TAG_MAP[interest] ?? []) out.add(term);
  }
  return out;
}
