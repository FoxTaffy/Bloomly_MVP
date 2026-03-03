<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import type { GroupType } from '@/stores/groups'

// ── Emit ─────────────────────────────────────────────────────────────────────
export interface CreateGroupPayload {
  name: string
  slug: string
  type: GroupType
  description: string
  isPublic: boolean
  accentColor: string
  // Event-specific
  eventTitle?: string
  eventShortCode?: string
  eventStartsAt?: string
  eventEndsAt?: string
  eventLocation?: string
  eventIsRecurring?: boolean
  eventIsTop?: boolean
  // Creative-specific
  commissionStatus?: 'open' | 'closed' | 'waitlist'
  commissionPrices?: Record<string, number>
  commissionCurrency?: string
  commissionMaxQueue?: number
  // Social / static / community
  socialLinks?: Record<string, string>
  // News
  newsCategory?: string
  // Shop
  shopCurrency?: string
  // Brand
  brandCategory?: string
}

const emit = defineEmits<{
  (e: 'create', val: CreateGroupPayload): void
  (e: 'close'): void
}>()

// ── Steps ────────────────────────────────────────────────────────────────────
const step = ref(1)
const totalSteps = 3

// ── Step 1: Основа ──────────────────────────────────────────────────────────
const name = ref('')
const slug = ref('')
const description = ref('')
const type = ref<GroupType>('community')
const isPublic = ref(true)

const autoSlug = computed(() =>
  name.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 60)
)

const types: { value: GroupType; label: string; icon: string; desc: string; color: string }[] = [
  { value: 'community', label: 'Сообщество',  icon: 'Users',        desc: 'Обсуждения, фандомы',       color: '#4C67CF' },
  { value: 'event',     label: 'Афиша',       icon: 'CalendarDays', desc: 'Ивенты, вечеринки, маркеты', color: '#66C770' },
  { value: 'creative',  label: 'Творческая',  icon: 'Palette',      desc: 'Мастерские, художники',      color: '#CD83F5' },
  { value: 'news',      label: 'Канал',       icon: 'Newspaper',    desc: 'Новости, обзоры, медиа',     color: '#FFC01F' },
  { value: 'shop',      label: 'Магазин',     icon: 'ShoppingBag',  desc: 'Мерч, принты, фурсьюты',     color: '#E76F51' },
  { value: 'brand',     label: 'Бренд',       icon: 'Building2',    desc: 'Бизнес, компания, проект',    color: '#00D4AA' },
  { value: 'static',    label: 'Паблик',      icon: 'Image',        desc: 'Мемы, арты, контент',         color: '#F7A9E2' },
]

// ── Step 2: Специфика по типу ───────────────────────────────────────────────
// Event
const eventTitle = ref('')
const eventShortCode = ref('')
const eventStartsAt = ref('')
const eventEndsAt = ref('')
const eventLocation = ref('')
const eventIsRecurring = ref(false)
const eventIsTop = ref(false)

// Creative
const commissionStatus = ref<'open' | 'closed' | 'waitlist'>('closed')
const commissionCurrency = ref('USD')
const commissionMaxQueue = ref(5)
const commissionPrices = ref<{ key: string; label: string; price: number }[]>([
  { key: 'headshot', label: 'Хэдшот', price: 0 },
  { key: 'halfbody', label: 'Полтела', price: 0 },
  { key: 'fullbody', label: 'В полный рост', price: 0 },
  { key: 'ref_sheet', label: 'Рефшит', price: 0 },
])

// News
const newsCategory = ref('general')
const newsCategories = ['general', 'fandom', 'tech', 'art', 'events', 'gaming']
const newsCategoryLabels: Record<string, string> = {
  general: 'Общие', fandom: 'Фандом', tech: 'Технологии', art: 'Арт', events: 'Афиша', gaming: 'Гейминг',
}

// Shop
const shopCurrency = ref('RUB')

// Brand
const brandCategory = ref('studio')
const brandCategories = ['studio', 'convention', 'agency', 'publisher', 'service', 'other']
const brandCategoryLabels: Record<string, string> = {
  studio: 'Студия', convention: 'Конвенция', agency: 'Агентство', publisher: 'Издательство', service: 'Сервис', other: 'Другое',
}

// Social (for static, community)
const socialTelegram = ref('')
const socialDiscord = ref('')
const socialTwitter = ref('')
const socialVk = ref('')
const socialWebsite = ref('')

// ── Step 3: Визуал ──────────────────────────────────────────────────────────
const accentColor = ref('#4C67CF')
const presetColors = ['#4C67CF', '#66C770', '#E14664', '#FFC01F', '#CD83F5', '#E76F51', '#F7A9E2', '#00D4AA']

// Auto-pick accent from type
watch(type, (t) => {
  const found = types.find(tt => tt.value === t)
  if (found) accentColor.value = found.color
})

// ── Step labels ─────────────────────────────────────────────────────────────
const step2Meta = computed((): { label: string; icon: string } => {
  switch (type.value) {
    case 'event':     return { label: 'Событие',  icon: 'CalendarDays' }
    case 'creative':  return { label: 'Заказы',   icon: 'Palette' }
    case 'news':      return { label: 'Канал',    icon: 'Newspaper' }
    case 'shop':      return { label: 'Магазин',  icon: 'ShoppingBag' }
    case 'brand':     return { label: 'Бренд',    icon: 'Building2' }
    default:          return { label: 'Ссылки',   icon: 'Share2' }
  }
})

const stepLabels = computed(() => [
  { num: 1, label: 'Основа',       icon: 'FileText' },
  { num: 2, label: step2Meta.value.label, icon: step2Meta.value.icon },
  { num: 3, label: 'Визуал',       icon: 'Sparkles' },
])

// ── Validation ──────────────────────────────────────────────────────────────
const step1Valid = computed(() => name.value.trim().length > 0)
const step2Valid = computed(() => {
  if (type.value === 'event') {
    return eventTitle.value.trim().length > 0 && eventShortCode.value.trim().length > 0
      && eventStartsAt.value && eventEndsAt.value
  }
  return true
})
const canNext = computed(() => {
  if (step.value === 1) return step1Valid.value
  if (step.value === 2) return step2Valid.value
  return true
})

function next() { if (step.value < totalSteps && canNext.value) step.value++ }
function prev() { if (step.value > 1) step.value-- }

watch(name, (n) => {
  if (type.value === 'event' && !eventShortCode.value) {
    eventShortCode.value = n.replace(/[^a-zA-Zа-яА-Я]/g, '').slice(0, 4).toUpperCase()
  }
})

// ── Submit ──────────────────────────────────────────────────────────────────
function submit() {
  const payload: CreateGroupPayload = {
    name: name.value.trim(),
    slug: slug.value.trim() || autoSlug.value,
    type: type.value,
    description: description.value.trim(),
    isPublic: isPublic.value,
    accentColor: accentColor.value,
  }

  if (type.value === 'event') {
    payload.eventTitle = eventTitle.value.trim()
    payload.eventShortCode = eventShortCode.value.trim().toUpperCase()
    payload.eventStartsAt = eventStartsAt.value
    payload.eventEndsAt = eventEndsAt.value
    payload.eventLocation = eventLocation.value.trim()
    payload.eventIsRecurring = eventIsRecurring.value
    payload.eventIsTop = eventIsTop.value
  }

  if (type.value === 'creative') {
    payload.commissionStatus = commissionStatus.value
    payload.commissionCurrency = commissionCurrency.value
    payload.commissionMaxQueue = commissionMaxQueue.value
    const prices: Record<string, number> = {}
    commissionPrices.value.forEach(p => { if (p.price > 0) prices[p.key] = p.price })
    payload.commissionPrices = prices
  }

  if (type.value === 'news') payload.newsCategory = newsCategory.value
  if (type.value === 'shop') payload.shopCurrency = shopCurrency.value
  if (type.value === 'brand') payload.brandCategory = brandCategory.value

  // Social links for static, community, news, brand
  if (['static', 'community', 'news', 'brand', 'shop'].includes(type.value)) {
    const links: Record<string, string> = {}
    if (socialTelegram.value.trim()) links.telegram = socialTelegram.value.trim()
    if (socialDiscord.value.trim()) links.discord = socialDiscord.value.trim()
    if (socialTwitter.value.trim()) links.twitter = socialTwitter.value.trim()
    if (socialVk.value.trim()) links.vk = socialVk.value.trim()
    if (socialWebsite.value.trim()) links.website = socialWebsite.value.trim()
    payload.socialLinks = links
  }

  emit('create', payload)
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[999] flex items-center justify-center p-4" @click.self="emit('close')">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div class="relative bg-brand-card border border-brand-border rounded-3xl p-6 max-w-lg w-full shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
        <button class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors z-20"
          @click="emit('close')">
          <BIcon name="X" class="w-4 h-4 text-white/50" />
        </button>

        <h2 class="text-xl font-extrabold text-white mb-1">Создать группу</h2>
        <p class="text-white/40 text-xs mb-4">Шаг {{ step }} из {{ totalSteps }}</p>

        <!-- ── Progress Steps ────────────────────────────────────────────── -->
        <div class="flex items-center gap-1 mb-6">
          <template v-for="(s, i) in stepLabels" :key="s.num">
            <div class="flex items-center gap-1.5 cursor-pointer select-none transition-all duration-200"
              :class="step >= s.num ? 'text-white' : 'text-white/25'"
              @click="s.num < step ? step = s.num : undefined">
              <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-300"
                :class="step === s.num
                  ? 'bg-brand-accent text-white shadow-accent'
                  : step > s.num
                    ? 'bg-brand-success/20 text-brand-success'
                    : 'bg-brand-bg border border-brand-border text-white/30'">
                <BIcon v-if="step > s.num" name="Check" class="w-3.5 h-3.5" />
                <span v-else>{{ s.num }}</span>
              </span>
              <span class="text-xs font-semibold hidden sm:inline">{{ s.label }}</span>
            </div>
            <div v-if="i < stepLabels.length - 1" class="flex-1 h-0.5 rounded-full mx-1 transition-colors duration-300"
              :class="step > s.num ? 'bg-brand-success/40' : 'bg-brand-border'" />
          </template>
        </div>

        <!-- ══════════════════════════════════════════════════════════════════
             STEP 1: Основа
             ═══════════════════════════════════════════════════════════════ -->
        <div v-show="step === 1" class="space-y-4">
          <!-- Type selector — 7 types scrollable grid -->
          <div>
            <p class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Тип группы</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
              <button
                v-for="t in types"
                :key="t.value"
                class="p-3 rounded-2xl border text-center transition-all duration-200 relative overflow-hidden"
                :class="type === t.value
                  ? 'border-brand-accent text-white'
                  : 'bg-brand-bg/40 border-brand-border text-white/50 hover:border-brand-accent/30'"
                :style="type === t.value ? { background: `${t.color}15`, borderColor: `${t.color}66` } : {}"
                @click="type = t.value"
              >
                <div class="w-8 h-8 rounded-xl mx-auto mb-1.5 flex items-center justify-center"
                  :style="{ backgroundColor: type === t.value ? `${t.color}22` : 'transparent' }">
                  <BIcon :name="t.icon" class="w-5 h-5" :style="type === t.value ? { color: t.color } : {}" />
                </div>
                <p class="text-xs font-bold">{{ t.label }}</p>
                <p class="text-[10px] text-white/30 mt-0.5 leading-tight">{{ t.desc }}</p>
                <div v-if="type === t.value" class="absolute top-1.5 right-1.5 w-4 h-4 rounded-md flex items-center justify-center"
                  :style="{ backgroundColor: t.color }">
                  <BIcon name="Check" class="w-2.5 h-2.5 text-white" />
                </div>
              </button>
            </div>
          </div>

          <!-- Name -->
          <div>
            <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Название</label>
            <input v-model="name" placeholder="Bloomly NEWS, FurMarket…"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none" />
          </div>

          <!-- Slug -->
          <div>
            <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Ссылка</label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">@</span>
              <input v-model="slug" :placeholder="autoSlug || 'slug'"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl pl-8 pr-4 py-3 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none" />
            </div>
          </div>

          <!-- Description -->
          <div>
            <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Описание</label>
            <textarea v-model="description" placeholder="Расскажите о группе…" rows="3"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none resize-none" />
          </div>

          <!-- Visibility -->
          <label class="flex items-center gap-3 cursor-pointer select-none bg-brand-bg/40 border border-brand-border rounded-2xl p-3">
            <button class="w-10 h-6 rounded-full transition-colors flex items-center p-0.5 shrink-0"
              :class="isPublic ? 'bg-brand-success' : 'bg-brand-muted'"
              @click.prevent="isPublic = !isPublic">
              <span class="w-5 h-5 rounded-full bg-white shadow-md transition-transform"
                :class="isPublic ? 'translate-x-4' : 'translate-x-0'" />
            </button>
            <div>
              <p class="text-white text-sm font-semibold">{{ isPublic ? 'Публичная' : 'Закрытая' }}</p>
              <p class="text-white/30 text-xs">{{ isPublic ? 'Все могут найти и вступить' : 'Только по приглашению' }}</p>
            </div>
          </label>
        </div>

        <!-- ══════════════════════════════════════════════════════════════════
             STEP 2: Специфика
             ═══════════════════════════════════════════════════════════════ -->
        <div v-show="step === 2" class="space-y-4">

          <!-- ── EVENT ───────────────────────────────────────────────────── -->
          <template v-if="type === 'event'">
            <div class="bg-brand-bg/40 border border-brand-success/20 rounded-2xl p-4 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-brand-success/10 flex items-center justify-center shrink-0 mt-0.5">
                <BIcon name="CalendarDays" class="w-5 h-5 text-brand-success" />
              </div>
              <div>
                <p class="text-white font-bold text-sm">Настройка события</p>
                <p class="text-white/40 text-xs">Первое событие будет создано автоматически</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Название события</label>
                <input v-model="eventTitle" placeholder="FurMarket, Eurofurence 30…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none" />
              </div>
              <div>
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Код (тег)</label>
                <input v-model="eventShortCode" placeholder="FURM" maxlength="10"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none uppercase font-bold tracking-wider" />
                <p class="text-white/25 text-[10px] mt-1">Будет в SOON-бейдже</p>
              </div>
              <div>
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Локация</label>
                <input v-model="eventLocation" placeholder="Atlanta, GA"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Начало</label>
                <input v-model="eventStartsAt" type="date"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-accent focus:outline-none [color-scheme:dark]" />
              </div>
              <div>
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Конец</label>
                <input v-model="eventEndsAt" type="date"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-accent focus:outline-none [color-scheme:dark]" />
              </div>
            </div>

            <div class="flex gap-3">
              <label class="flex items-center gap-3 flex-1 cursor-pointer select-none bg-brand-bg/40 border border-brand-border rounded-2xl p-3">
                <button class="w-10 h-6 rounded-full transition-colors flex items-center p-0.5 shrink-0"
                  :class="eventIsRecurring ? 'bg-brand-success' : 'bg-brand-muted'"
                  @click.prevent="eventIsRecurring = !eventIsRecurring">
                  <span class="w-5 h-5 rounded-full bg-white shadow-md transition-transform" :class="eventIsRecurring ? 'translate-x-4' : 'translate-x-0'" />
                </button>
                <div>
                  <p class="text-white text-xs font-bold">Ежегодное</p>
                  <p class="text-white/25 text-[10px]">Авто-цикл сезонов</p>
                </div>
              </label>
              <label class="flex items-center gap-3 flex-1 cursor-pointer select-none bg-brand-bg/40 border border-brand-border rounded-2xl p-3">
                <button class="w-10 h-6 rounded-full transition-colors flex items-center p-0.5 shrink-0"
                  :class="eventIsTop ? 'bg-brand-yellow' : 'bg-brand-muted'"
                  @click.prevent="eventIsTop = !eventIsTop">
                  <span class="w-5 h-5 rounded-full bg-white shadow-md transition-transform" :class="eventIsTop ? 'translate-x-4' : 'translate-x-0'" />
                </button>
                <div>
                  <p class="text-white text-xs font-bold">Топ событие</p>
                  <p class="text-white/25 text-[10px]">Выделить в ленте</p>
                </div>
              </label>
            </div>
          </template>

          <!-- ── CREATIVE ─────────────────────────────────────────────────── -->
          <template v-if="type === 'creative'">
            <div class="bg-brand-bg/40 border border-brand-purple/20 rounded-2xl p-4 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-brand-purple/10 flex items-center justify-center shrink-0 mt-0.5">
                <BIcon name="Palette" class="w-5 h-5 text-brand-purple" />
              </div>
              <div>
                <p class="text-white font-bold text-sm">Настройка заказов</p>
                <p class="text-white/40 text-xs">Укажите цены и параметры. Можно изменить позже.</p>
              </div>
            </div>

            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Статус заказов</label>
              <div class="grid grid-cols-3 gap-2">
                <button v-for="s in [
                  { value: 'open' as const, label: 'Открыт', color: 'brand-success' },
                  { value: 'waitlist' as const, label: 'Ожидание', color: 'brand-yellow' },
                  { value: 'closed' as const, label: 'Закрыт', color: 'brand-error' },
                ]" :key="s.value" class="py-2 rounded-xl border text-xs font-bold transition-all"
                  :class="commissionStatus === s.value
                    ? `bg-${s.color}/10 border-${s.color}/40 text-${s.color}`
                    : 'bg-brand-bg/40 border-brand-border text-white/40'"
                  @click="commissionStatus = s.value">
                  {{ s.label }}
                </button>
              </div>
            </div>

            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Базовые цены</label>
              <div class="space-y-2">
                <div v-for="p in commissionPrices" :key="p.key" class="flex items-center gap-3 bg-brand-bg/40 border border-brand-border rounded-xl px-3 py-2">
                  <span class="text-white text-xs font-semibold flex-1">{{ p.label }}</span>
                  <input v-model.number="p.price" type="number" min="0" placeholder="0"
                    class="w-24 bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-white text-xs text-right focus:border-brand-accent focus:outline-none" />
                  <span class="text-white/30 text-xs w-8">{{ commissionCurrency }}</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Макс. очередь</label>
                <input v-model.number="commissionMaxQueue" type="number" min="1" max="100"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-accent focus:outline-none" />
              </div>
              <div>
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Валюта</label>
                <select v-model="commissionCurrency"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-accent focus:outline-none appearance-none">
                  <option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="RUB">RUB (₽)</option>
                </select>
              </div>
            </div>
          </template>

          <!-- ── NEWS ─────────────────────────────────────────────────────── -->
          <template v-if="type === 'news'">
            <div class="bg-brand-bg/40 border border-brand-yellow/20 rounded-2xl p-4 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-brand-yellow/10 flex items-center justify-center shrink-0 mt-0.5">
                <BIcon name="Newspaper" class="w-5 h-5 text-brand-yellow" />
              </div>
              <div>
                <p class="text-white font-bold text-sm">Создание новостного канала</p>
                <p class="text-white/40 text-xs">Публикуйте новости, обзоры, объявления для подписчиков.</p>
              </div>
            </div>

            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Категория канала</label>
              <div class="grid grid-cols-3 gap-2">
                <button v-for="cat in newsCategories" :key="cat"
                  class="py-2.5 rounded-xl border text-xs font-bold transition-all"
                  :class="newsCategory === cat ? 'bg-brand-yellow/10 border-brand-yellow/40 text-brand-yellow' : 'bg-brand-bg/40 border-brand-border text-white/40'"
                  @click="newsCategory = cat">
                  {{ newsCategoryLabels[cat] }}
                </button>
              </div>
            </div>

            <!-- Social links for news -->
            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Соцсети (необязательно)</label>
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center shrink-0">
                    <BIcon name="Send" class="w-3.5 h-3.5 text-white/40" />
                  </div>
                  <input v-model="socialTelegram" placeholder="https://t.me/..."
                    class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none" />
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center shrink-0">
                    <BIcon name="Globe" class="w-3.5 h-3.5 text-white/40" />
                  </div>
                  <input v-model="socialWebsite" placeholder="https://..."
                    class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none" />
                </div>
              </div>
            </div>
          </template>

          <!-- ── SHOP ─────────────────────────────────────────────────────── -->
          <template v-if="type === 'shop'">
            <div class="bg-brand-bg/40 border border-[#E76F51]/20 rounded-2xl p-4 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-[#E76F51]/10 flex items-center justify-center shrink-0 mt-0.5">
                <BIcon name="ShoppingBag" class="w-5 h-5 text-[#E76F51]" />
              </div>
              <div>
                <p class="text-white font-bold text-sm">Создание магазина</p>
                <p class="text-white/40 text-xs">Продавайте мерч, принты, фурсьюты — всё для фандома!</p>
              </div>
            </div>

            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Основная валюта</label>
              <div class="grid grid-cols-3 gap-2">
                <button v-for="cur in ['RUB', 'USD', 'EUR']" :key="cur"
                  class="py-2.5 rounded-xl border text-xs font-bold transition-all"
                  :class="shopCurrency === cur ? 'bg-[#E76F51]/10 border-[#E76F51]/40 text-[#E76F51]' : 'bg-brand-bg/40 border-brand-border text-white/40'"
                  @click="shopCurrency = cur">
                  {{ cur === 'RUB' ? '₽ RUB' : cur === 'USD' ? '$ USD' : '€ EUR' }}
                </button>
              </div>
            </div>

            <div class="bg-brand-bg/20 border border-brand-border rounded-2xl p-4">
              <div class="flex items-center gap-2 mb-2">
                <BIcon name="Info" class="w-4 h-4 text-white/30" />
                <p class="text-white/40 text-xs font-semibold">Каталог товаров</p>
              </div>
              <p class="text-white/30 text-xs">Товары можно добавить после создания группы в настройках через прайс-лист.</p>
            </div>

            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center shrink-0">
                  <BIcon name="Globe" class="w-3.5 h-3.5 text-white/40" />
                </div>
                <input v-model="socialWebsite" placeholder="Ссылка на основной магазин (если есть)"
                  class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none" />
              </div>
            </div>
          </template>

          <!-- ── BRAND ────────────────────────────────────────────────────── -->
          <template v-if="type === 'brand'">
            <div class="bg-brand-bg/40 border border-[#00D4AA]/20 rounded-2xl p-4 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-[#00D4AA]/10 flex items-center justify-center shrink-0 mt-0.5">
                <BIcon name="Building2" class="w-5 h-5 text-[#00D4AA]" />
              </div>
              <div>
                <p class="text-white font-bold text-sm">Страница бренда</p>
                <p class="text-white/40 text-xs">Бизнес, сервис, студия или команда — расскажите о себе.</p>
              </div>
            </div>

            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Категория</label>
              <div class="grid grid-cols-3 gap-2">
                <button v-for="cat in brandCategories" :key="cat"
                  class="py-2.5 rounded-xl border text-xs font-bold transition-all"
                  :class="brandCategory === cat ? 'bg-[#00D4AA]/10 border-[#00D4AA]/40 text-[#00D4AA]' : 'bg-brand-bg/40 border-brand-border text-white/40'"
                  @click="brandCategory = cat">
                  {{ brandCategoryLabels[cat] }}
                </button>
              </div>
            </div>

            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Соцсети и контакты</label>
              <div class="space-y-2">
                <div v-for="link in [
                  { ref: socialTelegram, icon: 'Send', placeholder: 'https://t.me/...' },
                  { ref: socialWebsite, icon: 'Globe', placeholder: 'https://...' },
                  { ref: socialVk, icon: 'Globe', placeholder: 'https://vk.com/...' },
                ]" :key="link.placeholder" class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center shrink-0">
                    <BIcon :name="link.icon" class="w-3.5 h-3.5 text-white/40" />
                  </div>
                  <input :value="link.ref" :placeholder="link.placeholder"
                    class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none"
                    @input="(e: any) => {
                      if (link.placeholder.includes('t.me')) socialTelegram = e.target.value
                      else if (link.placeholder.includes('vk')) socialVk = e.target.value
                      else socialWebsite = e.target.value
                    }" />
                </div>
              </div>
            </div>
          </template>

          <!-- ── COMMUNITY / STATIC ───────────────────────────────────────── -->
          <template v-if="type === 'community' || type === 'static'">
            <div class="bg-brand-bg/40 rounded-2xl p-4 flex items-start gap-3"
              :class="type === 'community' ? 'border border-brand-accent/20' : 'border border-brand-pink/20'">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                :class="type === 'community' ? 'bg-brand-accent/10' : 'bg-brand-pink/10'">
                <BIcon :name="type === 'community' ? 'Users' : 'Image'" class="w-5 h-5"
                  :class="type === 'community' ? 'text-brand-accent' : 'text-brand-pink'" />
              </div>
              <div>
                <p class="text-white font-bold text-sm">{{ type === 'community' ? 'Соцсети и ссылки' : 'Ссылки паблика' }}</p>
                <p class="text-white/40 text-xs">Добавьте ссылки на внешние площадки. Можно пропустить.</p>
              </div>
            </div>

            <div class="space-y-3">
              <div v-for="link in [
                { model: 'telegram', icon: 'Send', label: 'Telegram', placeholder: 'https://t.me/...' },
                { model: 'discord', icon: 'MessageCircle', label: 'Discord', placeholder: 'https://discord.gg/...' },
                { model: 'twitter', icon: 'Twitter', label: 'Twitter / X', placeholder: 'https://x.com/...' },
                { model: 'vk', icon: 'Globe', label: 'VK', placeholder: 'https://vk.com/...' },
                { model: 'website', icon: 'Globe', label: 'Сайт', placeholder: 'https://...' },
              ]" :key="link.model" class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-brand-bg border border-brand-border flex items-center justify-center shrink-0">
                  <BIcon :name="link.icon" class="w-4 h-4 text-white/40" />
                </div>
                <input
                  :value="link.model === 'telegram' ? socialTelegram
                    : link.model === 'discord' ? socialDiscord
                    : link.model === 'twitter' ? socialTwitter
                    : link.model === 'vk' ? socialVk
                    : socialWebsite"
                  :placeholder="link.placeholder"
                  class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-none"
                  @input="(e: any) => {
                    const val = e.target.value
                    if (link.model === 'telegram') socialTelegram = val
                    else if (link.model === 'discord') socialDiscord = val
                    else if (link.model === 'twitter') socialTwitter = val
                    else if (link.model === 'vk') socialVk = val
                    else socialWebsite = val
                  }" />
              </div>
            </div>
          </template>
        </div>

        <!-- ══════════════════════════════════════════════════════════════════
             STEP 3: Визуал
             ═══════════════════════════════════════════════════════════════ -->
        <div v-show="step === 3" class="space-y-4">
          <div class="bg-brand-bg/40 border border-brand-accent/20 rounded-2xl p-4 flex items-start gap-3">
            <div class="w-9 h-9 rounded-xl bg-brand-accent/10 flex items-center justify-center shrink-0 mt-0.5">
              <BIcon name="Sparkles" class="w-5 h-5 text-brand-accent" />
            </div>
            <div>
              <p class="text-white font-bold text-sm">Финальные штрихи</p>
              <p class="text-white/40 text-xs">Аватар и баннер можно загрузить позже в настройках.</p>
            </div>
          </div>

          <!-- Color picker -->
          <div>
            <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Акцентный цвет</label>
            <div class="flex flex-wrap gap-2 mb-3">
              <button v-for="c in presetColors" :key="c"
                class="w-9 h-9 rounded-xl border-2 transition-all duration-200 hover:scale-110"
                :class="accentColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'"
                :style="{ backgroundColor: c }" @click="accentColor = c" />
              <label class="w-9 h-9 rounded-xl border-2 border-dashed border-brand-border hover:border-brand-accent/40 flex items-center justify-center cursor-pointer transition-colors">
                <BIcon name="Pipette" class="w-4 h-4 text-white/30" />
                <input v-model="accentColor" type="color" class="sr-only" />
              </label>
            </div>
          </div>

          <!-- Preview card -->
          <div>
            <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2 block">Превью</label>
            <div class="rounded-2xl border border-brand-border overflow-hidden">
              <div class="h-20" :style="{ background: `linear-gradient(135deg, ${accentColor}44, ${accentColor}11, #16192F)` }" />
              <div class="p-4 bg-brand-card -mt-6">
                <div class="flex items-end gap-3">
                  <div class="w-12 h-12 rounded-xl border-2 border-brand-card flex items-center justify-center"
                    :style="{ backgroundColor: accentColor + '22' }">
                    <BIcon :name="types.find(t => t.value === type)?.icon ?? 'Grid'" class="w-6 h-6" :style="{ color: accentColor }" />
                  </div>
                  <div class="flex-1 min-w-0 pb-1">
                    <p class="text-white font-extrabold text-sm truncate">{{ name || 'Название группы' }}</p>
                    <div class="flex items-center gap-2">
                      <p class="text-white/30 text-xs">@{{ slug || autoSlug || 'slug' }}</p>
                      <span class="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-bg font-semibold" :style="{ color: accentColor }">
                        {{ types.find(t => t.value === type)?.label }}
                      </span>
                    </div>
                  </div>
                </div>
                <p v-if="description" class="text-white/40 text-xs mt-2 line-clamp-2">{{ description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Navigation Buttons ────────────────────────────────────────── -->
        <div class="flex gap-3 mt-6">
          <button v-if="step > 1"
            class="px-5 py-3 rounded-2xl bg-brand-bg border border-brand-border text-white/60 font-bold text-sm hover:bg-brand-border/50 transition-colors"
            @click="prev">
            <BIcon name="ArrowLeft" class="w-4 h-4 inline mr-1 -mt-0.5" /> Назад
          </button>
          <button v-if="step < totalSteps"
            class="flex-1 py-3 rounded-2xl bg-brand-accent text-white font-bold text-sm hover:bg-brand-accent-plus transition-colors shadow-accent disabled:opacity-40"
            :disabled="!canNext" @click="next">
            Далее <BIcon name="ArrowRight" class="w-4 h-4 inline ml-1 -mt-0.5" />
          </button>
          <button v-if="step === totalSteps"
            class="flex-1 py-3 rounded-2xl bg-brand-success text-white font-bold text-sm hover:bg-brand-success/80 transition-colors shadow-lg shadow-brand-success/20 disabled:opacity-40"
            :disabled="!step1Valid" @click="submit">
            <BIcon name="Sparkles" class="w-4 h-4 inline mr-1.5 -mt-0.5" /> Создать группу
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
