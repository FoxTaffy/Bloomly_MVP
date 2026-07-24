import prisma from '../config/prisma.js';

// Site-wide toggles, gating real behavior (registration, AutoMod pipeline,
// maintenance mode). Backed by the SiteSetting key-value table; missing rows
// fall back to these defaults.
const DEFAULTS = {
  open_registration: true,
  automod_enabled: true,
  maintenance_mode: false,
} as const;

export type SettingKey = keyof typeof DEFAULTS;

let cache: Record<SettingKey, boolean> | null = null;
let cachedAt = 0;
const TTL_MS = 5000; // short cache so a toggle takes effect within a few seconds

export async function getAllSettings(): Promise<Record<SettingKey, boolean>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await prisma.siteSetting.findMany();
  const map = { ...DEFAULTS } as Record<SettingKey, boolean>;
  for (const r of rows) {
    if (r.key in DEFAULTS) map[r.key as SettingKey] = r.value;
  }
  cache = map;
  cachedAt = Date.now();
  return map;
}

export async function getSetting(key: SettingKey): Promise<boolean> {
  const all = await getAllSettings();
  return all[key];
}

export async function setSetting(key: SettingKey, value: boolean): Promise<void> {
  await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  cache = null;
}
