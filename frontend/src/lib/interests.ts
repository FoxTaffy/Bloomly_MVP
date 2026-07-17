/** "Любимое" categories: fixed set, one free-typed value each. Editable at onboarding, Settings, and on the profile. */
export interface FavoriteCategory {
  key: 'fav_food' | 'fav_animal' | 'fav_music' | 'fav_artist' | 'fav_film'
  label: string
  placeholder: string
}

export const FAVORITE_CATEGORIES: FavoriteCategory[] = [
  { key: 'fav_food', label: 'Еда', placeholder: 'Например: пицца, борщ, суши…' },
  { key: 'fav_animal', label: 'Животное', placeholder: 'Например: лиса, волк, дракон…' },
  { key: 'fav_music', label: 'Музыка', placeholder: 'Например: синти-поп, рок…' },
  { key: 'fav_artist', label: 'Художник', placeholder: 'Например: Rukis…' },
  { key: 'fav_film', label: 'Фильм/Аниме', placeholder: 'Например: Zootopia…' },
]
