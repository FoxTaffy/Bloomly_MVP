import { ru, type Translation } from './ru';
import { en } from './en';
import { jp } from './jp';
import { cn } from './cn';
import { de } from './de';
import { fr } from './fr';
import { es } from './es';
import { pt } from './pt';

export const translations = {
  RU: ru,
  EN: en,
  JP: jp,
  CN: cn,
  DE: de,
  FR: fr,
  ES: es,
  PT: pt,
} satisfies Record<string, Translation>;

export type Lang = keyof typeof translations;
export type { Translation };
