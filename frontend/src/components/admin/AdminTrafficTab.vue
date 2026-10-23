<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/api'
import { apiErrorMessage } from '@/lib/apiError'
import BIcon from '@/components/BIcon.vue'

// Рекламные ссылки с UTM и воронка «клик → визит → регистрация → оплата».
// Защита от потери трафика (Anti-Collision Tracking) описана в блоке внизу страницы и в backend/src/modules/tracking/service.ts.
interface LinkStats {
  clicks: number; unique_clicks: number; bots: number; visitors: number
  signups: number; verified: number; onboarded: number; paid: number
  last_touch_signups: number; lost_before_landing: number
}
interface TrackingLink {
  id: string; code: string; name: string; target_path: string
  utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string | null; utm_term: string | null
  is_active: boolean; created_at: string; stats: LinkStats
}
interface Totals {
  clicks: number; unique_clicks: number; bots: number; visitors: number; signups: number; paid: number
  lost_before_landing: number; attribution_conflicts: number; attributed_signups: number
}
interface ManualUtm { source: string | null; campaign: string | null; visitors: number; signups: number; verified: number; onboarded: number; paid: number }
interface SeriesPoint { date: string; clicks: number; visitors: number; signups: number }

const days = ref(30)
const links = ref<TrackingLink[]>([])
const totals = ref<Totals | null>(null)
const manualUtm = ref<ManualUtm[]>([])
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get('/admin/tracking/overview', { params: { days: days.value } })
    links.value = res.data.data.links
    totals.value = res.data.data.totals
    manualUtm.value = res.data.data.manual_utm
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось загрузить статистику'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// ── Создание ссылки ──────────────────────────────────────────────────────────
const OTHER = '__other'
const SOURCES = [
  { value: 'telegram', label: 'Telegram' }, { value: 'vk', label: 'ВКонтакте' }, { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' }, { value: 'youtube', label: 'YouTube' }, { value: 'google', label: 'Google' },
  { value: 'yandex', label: 'Яндекс' }, { value: 'twitter', label: 'X (Twitter)' }, { value: 'blogger', label: 'Блогер' },
]
const MEDIUMS = [
  { value: 'cpc', label: 'Платная реклама' }, { value: 'post', label: 'Пост или публикация' }, { value: 'story', label: 'Сторис' },
  { value: 'influencer', label: 'Интеграция у блогера' }, { value: 'banner', label: 'Баннер' }, { value: 'email', label: 'Рассылка' },
  { value: 'social', label: 'Соцсети (без оплаты)' },
]
const PAGES = [
  { path: '/login', label: 'Регистрация и вход' },
  { path: '/', label: 'Главная страница' },
]

const showForm = ref(false)
const form = ref(emptyForm())
const saving = ref(false)
const formError = ref('')

function emptyForm() {
  return {
    name: '', target_path: '/login', source: 'telegram', sourceCustom: '', medium: 'cpc', mediumCustom: '',
    utm_campaign: '', utm_content: '', utm_term: '', code: '',
  }
}

// Метки только латиницей: пробелы заменяем на «_», остальное проверит сервер
const slug = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '_')
const utmSource = computed(() => slug(form.value.source === OTHER ? form.value.sourceCustom : form.value.source))
const utmMedium = computed(() => slug(form.value.medium === OTHER ? form.value.mediumCustom : form.value.medium))
const preview = computed(() =>
  [utmSource.value, utmMedium.value, slug(form.value.utm_campaign), slug(form.value.utm_content)].filter(Boolean).join(' / '))

async function create() {
  saving.value = true
  formError.value = ''
  const f = form.value
  try {
    await api.post('/admin/tracking/links', {
      name: f.name, target_path: f.target_path, code: f.code,
      utm_source: utmSource.value, utm_medium: utmMedium.value,
      utm_campaign: slug(f.utm_campaign), utm_content: slug(f.utm_content), utm_term: slug(f.utm_term),
    })
    form.value = emptyForm()
    showForm.value = false
    await load()
  } catch (e) {
    formError.value = apiErrorMessage(e) ?? 'Не удалось создать ссылку'
  } finally {
    saving.value = false
  }
}

// ── Ссылки ───────────────────────────────────────────────────────────────────
const origin = window.location.origin
const shortUrl = (l: TrackingLink) => `${origin}/api/t/${l.code}`
function directUrl(l: TrackingLink) {
  const q = new URLSearchParams({ utm_source: l.utm_source, utm_medium: l.utm_medium, utm_campaign: l.utm_campaign })
  if (l.utm_content) q.set('utm_content', l.utm_content)
  if (l.utm_term) q.set('utm_term', l.utm_term)
  q.set('bl_ref', l.code)
  return `${origin}${l.target_path}?${q.toString()}`
}

const copied = ref('')
async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    setTimeout(() => { if (copied.value === key) copied.value = '' }, 1500)
  } catch {
    error.value = 'Не удалось скопировать — выделите ссылку вручную'
  }
}

async function toggle(l: TrackingLink) {
  try {
    await api.patch(`/admin/tracking/links/${l.id}`, { is_active: !l.is_active })
    l.is_active = !l.is_active
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось изменить ссылку'
  }
}

async function remove(l: TrackingLink) {
  if (!window.confirm(`Удалить ссылку «${l.name}»? Её клики и визиты исчезнут, а размещённая реклама будет вести на главную.`)) return
  try {
    await api.delete(`/admin/tracking/links/${l.id}`)
    if (openId.value === l.id) openId.value = null
    await load()
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось удалить ссылку'
  }
}

// ── Динамика ─────────────────────────────────────────────────────────────────
const openId = ref<string | null>(null)
const series = ref<SeriesPoint[]>([])
const seriesLoading = ref(false)

async function toggleDetails(l: TrackingLink) {
  if (openId.value === l.id) { openId.value = null; return }
  openId.value = l.id
  seriesLoading.value = true
  series.value = []
  try {
    const res = await api.get(`/admin/tracking/links/${l.id}/series`, { params: { days: days.value } })
    series.value = res.data.data.series
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось загрузить динамику'
  } finally {
    seriesLoading.value = false
  }
}
const seriesMax = computed(() => Math.max(1, ...series.value.flatMap((p) => [p.clicks, p.visitors, p.signups])))

// ── Форматирование ───────────────────────────────────────────────────────────
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—')
const dateShort = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
const funnel = (s: LinkStats) => [
  { label: 'Переходы', value: s.unique_clicks, base: s.unique_clicks },
  { label: 'Открыли сайт', value: s.visitors, base: s.unique_clicks },
  { label: 'Регистрации', value: s.signups, base: s.visitors },
  { label: 'Подтвердили почту', value: s.verified, base: s.signups },
  { label: 'Прошли онбординг', value: s.onboarded, base: s.verified },
  { label: 'Оплатили', value: s.paid, base: s.signups },
]
</script>

<template>
  <div class="space-y-5">
    <!-- Период + действия -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex rounded-xl border border-brand-border overflow-hidden" style="background:#1F223C">
        <button v-for="d in [7, 14, 30, 90]" :key="d" type="button" @click="days = d; load()"
          class="px-3 py-1.5 text-xs font-bold transition-colors"
          :class="days === d ? 'bg-brand-accent text-white' : 'text-white/50 hover:text-white'">{{ d }} дн.</button>
      </div>
      <button type="button" @click="load" :disabled="loading"
        class="px-3 py-1.5 rounded-xl text-xs font-bold border border-brand-border text-white/60 hover:text-white disabled:opacity-50">
        {{ loading ? 'Обновление…' : 'Обновить' }}
      </button>
      <button type="button" @click="showForm = !showForm"
        class="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-brand-accent text-white hover:brightness-110 transition-all">
        <BIcon name="Plus" class="w-3.5 h-3.5" /> Новая ссылка
      </button>
    </div>

    <p v-if="error" role="alert" class="text-xs text-brand-error">{{ error }}</p>

    <!-- Сводка -->
    <div v-if="totals" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div v-for="c in [
        { label: 'Переходы по ссылкам', value: totals.unique_clicks, hint: `ботов не считаем: ${totals.bots}` },
        { label: 'Открыли сайт', value: totals.visitors, hint: `${pct(totals.visitors, totals.unique_clicks)} от кликов` },
        { label: 'Регистрации', value: totals.signups, hint: `${pct(totals.signups, totals.visitors)} от открывших сайт` },
        { label: 'Оплатили', value: totals.paid, hint: `${pct(totals.paid, totals.signups)} от регистраций` },
      ]" :key="c.label" class="rounded-2xl border border-brand-border p-4" style="background:#1F223C">
        <p class="text-[11px] font-bold text-white/40 uppercase tracking-wide">{{ c.label }}</p>
        <p class="text-2xl font-black text-white mt-1">{{ c.value }}</p>
        <p class="text-[11px] text-white/35 mt-0.5">{{ c.hint }}</p>
      </div>
    </div>

    <!-- Анти-потери -->
    <div v-if="totals && (totals.lost_before_landing > 0 || totals.attribution_conflicts > 0)"
      class="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 flex gap-3">
      <BIcon name="AlertTriangle" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div class="text-xs text-white/70 space-y-1">
        <p v-if="totals.lost_before_landing > 0">
          <b class="text-amber-300">{{ totals.lost_before_landing }}</b> переходов не дошли до открытия сайта (закрыли вкладку, блокировщик, медленная сеть). Сервер их всё равно посчитал, поэтому в воронке они не пропадают.
        </p>
        <p v-if="totals.attribution_conflicts > 0">
          <b class="text-amber-300">{{ totals.attribution_conflicts }}</b> из {{ totals.attributed_signups }} регистраций пришли с нескольких реклам. Регистрация засчитывается той, что была первой; в строке ссылки видно, сколько раз она была последней.
        </p>
      </div>
    </div>

    <!-- Форма -->
    <form v-if="showForm" class="rounded-3xl border border-brand-border p-5 md:p-6 space-y-5" style="background:#1F223C" @submit.prevent="create">
      <div>
        <p class="text-base font-bold text-white">Новая рекламная ссылка</p>
        <p class="text-xs text-white/40 mt-1">Укажите, где будет стоять реклама. Ссылка сама проставит UTM-метки и посчитает переходы.</p>
      </div>

      <div class="grid sm:grid-cols-2 gap-4">
        <label class="block">
          <span class="text-xs font-bold text-white/55">Название</span>
          <input v-model="form.name" class="adm-input mt-1.5" maxlength="120" placeholder="Например: пост в канале про фурри" required />
          <span class="block text-[11px] text-white/30 mt-1">Видно только вам, в списке ссылок</span>
        </label>
        <label class="block">
          <span class="text-xs font-bold text-white/55">Куда ведёт ссылка</span>
          <select v-model="form.target_path" class="adm-input mt-1.5">
            <option v-for="p in PAGES" :key="p.path" :value="p.path" class="bg-[#1F223C]">{{ p.label }}</option>
          </select>
          <span class="block text-[11px] text-white/30 mt-1">Страница, на которую попадёт человек</span>
        </label>
      </div>

      <div class="border-t border-brand-border pt-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label class="block">
            <span class="text-xs font-bold text-white/55">Где размещаем</span>
            <select v-model="form.source" class="adm-input mt-1.5">
              <option v-for="s in SOURCES" :key="s.value" :value="s.value" class="bg-[#1F223C]">{{ s.label }}</option>
              <option :value="OTHER" class="bg-[#1F223C]">Другое…</option>
            </select>
          </label>
          <input v-if="form.source === OTHER" v-model="form.sourceCustom" class="adm-input mt-2" maxlength="60" placeholder="Латиницей, например: habr" required />
        </div>
        <div>
          <label class="block">
            <span class="text-xs font-bold text-white/55">Тип рекламы</span>
            <select v-model="form.medium" class="adm-input mt-1.5">
              <option v-for="m in MEDIUMS" :key="m.value" :value="m.value" class="bg-[#1F223C]">{{ m.label }}</option>
              <option :value="OTHER" class="bg-[#1F223C]">Другое…</option>
            </select>
          </label>
          <input v-if="form.medium === OTHER" v-model="form.mediumCustom" class="adm-input mt-2" maxlength="60" placeholder="Латиницей, например: podcast" required />
        </div>
        <label class="block">
          <span class="text-xs font-bold text-white/55">Название кампании</span>
          <input v-model="form.utm_campaign" class="adm-input mt-1.5" maxlength="100" placeholder="autumn_launch" required />
          <span class="block text-[11px] text-white/30 mt-1">Латиницей. Все ссылки одной акции называйте одинаково</span>
        </label>
        <label class="block">
          <span class="text-xs font-bold text-white/55">Вариант объявления <span class="font-normal text-white/30">— по желанию</span></span>
          <input v-model="form.utm_content" class="adm-input mt-1.5" maxlength="100" placeholder="video_a" />
          <span class="block text-[11px] text-white/30 mt-1">Чтобы сравнить два креатива в одной кампании</span>
        </label>
      </div>

      <details class="group border-t border-brand-border pt-4">
        <summary class="cursor-pointer text-xs font-bold text-white/45 hover:text-white/70 select-none list-none flex items-center gap-1.5">
          <BIcon name="Plus" class="w-3.5 h-3.5 group-open:rotate-45 transition-transform" /> Дополнительно
        </summary>
        <div class="grid sm:grid-cols-2 gap-4 mt-4">
          <label class="block">
            <span class="text-xs font-bold text-white/55">Свой код ссылки</span>
            <input v-model="form.code" class="adm-input mt-1.5" maxlength="40" placeholder="Пусто — код создастся сам" />
            <span class="block text-[11px] text-white/30 mt-1">Латиницей, 3–40 символов: ссылка станет /api/t/ваш-код</span>
          </label>
          <label class="block">
            <span class="text-xs font-bold text-white/55">Ключевое слово</span>
            <input v-model="form.utm_term" class="adm-input mt-1.5" maxlength="100" />
            <span class="block text-[11px] text-white/30 mt-1">Нужно в основном для поисковой рекламы</span>
          </label>
        </div>
      </details>

      <div class="rounded-2xl bg-white/4 px-4 py-3 text-xs">
        <span class="text-white/40">Метки ссылки: </span>
        <span class="text-white/80 font-semibold break-all">{{ preview || '—' }}</span>
        <p class="text-[11px] text-white/30 mt-1">После создания метки и страницу изменить нельзя: ссылка уже может стоять в рекламе.</p>
      </div>

      <p v-if="formError" role="alert" class="text-xs text-brand-error">{{ formError }}</p>
      <div class="flex gap-2">
        <button type="submit" :disabled="saving"
          class="px-5 py-2.5 rounded-xl text-sm font-bold bg-brand-accent text-white disabled:opacity-50 hover:brightness-110 transition-all">
          {{ saving ? 'Создаём…' : 'Создать ссылку' }}
        </button>
        <button type="button" @click="showForm = false" class="px-4 py-2.5 rounded-xl text-sm font-bold text-white/50 hover:text-white">Отмена</button>
      </div>
    </form>

    <!-- Список -->
    <div v-if="loading && !links.length" class="text-xs text-white/40">Загрузка…</div>
    <div v-else-if="!links.length" class="rounded-3xl border border-brand-border p-8 text-center text-sm text-white/40" style="background:#1F223C">
      Ссылок пока нет. Создайте первую: она сама проставит UTM-метки и посчитает переходы, регистрации и оплаты.
    </div>

    <div v-for="l in links" :key="l.id" class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C"
      :class="{ 'opacity-60': !l.is_active }">
      <div class="p-5 space-y-3">
        <div class="flex flex-wrap items-start gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold text-white truncate">{{ l.name }}</p>
            <p class="text-[11px] text-white/40 mt-0.5">
              {{ l.utm_source }} / {{ l.utm_medium }} / {{ l.utm_campaign }}<span v-if="l.utm_content"> / {{ l.utm_content }}</span>
              → {{ l.target_path }}
            </p>
          </div>
          <span v-if="!l.is_active" class="text-[10px] font-extrabold px-2 py-1 rounded-full bg-white/8 text-white/50">ПАУЗА</span>
          <button type="button" :title="l.is_active ? 'Поставить на паузу' : 'Включить'" @click="toggle(l)"
            class="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5">
            <BIcon :name="l.is_active ? 'Pause' : 'Play'" class="w-4 h-4" />
          </button>
          <button type="button" title="Динамика по дням" @click="toggleDetails(l)"
            class="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/5"
            :class="openId === l.id ? 'text-brand-accent' : 'text-white/50 hover:text-white'">
            <BIcon name="BarChart3" class="w-4 h-4" />
          </button>
          <button type="button" title="Удалить" @click="remove(l)"
            class="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-rose-500/40">
            <BIcon name="Trash2" class="w-4 h-4" />
          </button>
        </div>

        <!-- Ссылки -->
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold text-white/35 w-16 shrink-0">Короткая</span>
            <code class="flex-1 min-w-0 truncate text-xs text-white/75 bg-white/5 rounded-lg px-2.5 py-1.5">{{ shortUrl(l) }}</code>
            <button type="button" @click="copy(shortUrl(l), l.id + 's')"
              class="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-brand-accent/15 text-brand-accent hover:bg-brand-accent/25">
              <BIcon :name="copied === l.id + 's' ? 'Check' : 'Copy'" class="w-3 h-3" /> {{ copied === l.id + 's' ? 'Скопировано' : 'Копировать' }}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold text-white/35 w-16 shrink-0">Прямая</span>
            <code class="flex-1 min-w-0 truncate text-xs text-white/50 bg-white/5 rounded-lg px-2.5 py-1.5">{{ directUrl(l) }}</code>
            <button type="button" @click="copy(directUrl(l), l.id + 'd')"
              class="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/5 text-white/60 hover:text-white">
              <BIcon :name="copied === l.id + 'd' ? 'Check' : 'Copy'" class="w-3 h-3" /> {{ copied === l.id + 'd' ? 'Скопировано' : 'Копировать' }}
            </button>
          </div>
        </div>

        <!-- Воронка -->
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <div v-for="(f, i) in funnel(l.stats)" :key="f.label" class="rounded-xl bg-white/4 px-3 py-2">
            <p class="text-[10px] font-bold text-white/35 truncate">{{ f.label }}</p>
            <p class="text-lg font-black text-white leading-tight">{{ f.value }}</p>
            <p v-if="i > 0" class="text-[10px] text-white/35">{{ pct(f.value, f.base) }}</p>
            <p v-else class="text-[10px] text-white/35">ботов: {{ l.stats.bots }}</p>
          </div>
        </div>
        <p v-if="l.stats.lost_before_landing > 0 || l.stats.last_touch_signups !== l.stats.signups" class="text-[11px] text-white/40">
          <template v-if="l.stats.lost_before_landing > 0">Не дошли до сайта: {{ l.stats.lost_before_landing }}. </template>
          <template v-if="l.stats.last_touch_signups !== l.stats.signups">
            Регистраций, где эта реклама была первой: {{ l.stats.signups }}, последней: {{ l.stats.last_touch_signups }}.
          </template>
        </p>
      </div>

      <!-- Динамика -->
      <div v-if="openId === l.id" class="border-t border-brand-border px-5 py-4">
        <div v-if="seriesLoading" class="text-xs text-white/40">Загрузка…</div>
        <template v-else>
          <div class="flex items-end gap-px h-28">
            <div v-for="p in series" :key="p.date" class="flex-1 min-w-0 h-full flex items-end justify-center gap-px"
              :title="`${dateShort(p.date)}: клики ${p.clicks}, визиты ${p.visitors}, регистрации ${p.signups}`">
              <div class="w-1/3 rounded-t-sm bg-brand-accent/80" :style="{ height: (p.clicks / seriesMax) * 100 + '%', minHeight: p.clicks ? '2px' : '0' }" />
              <div class="w-1/3 rounded-t-sm bg-teal-400/80" :style="{ height: (p.visitors / seriesMax) * 100 + '%', minHeight: p.visitors ? '2px' : '0' }" />
              <div class="w-1/3 rounded-t-sm bg-amber-400/90" :style="{ height: (p.signups / seriesMax) * 100 + '%', minHeight: p.signups ? '2px' : '0' }" />
            </div>
          </div>
          <div class="flex justify-between text-[10px] text-white/30 mt-1">
            <span>{{ series.length ? dateShort(series[0].date) : '' }}</span>
            <span>{{ series.length ? dateShort(series[series.length - 1].date) : '' }}</span>
          </div>
          <div class="flex gap-4 mt-2 text-[11px] text-white/50">
            <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm bg-brand-accent/80" /> переходы</span>
            <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm bg-teal-400/80" /> открыли сайт</span>
            <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm bg-amber-400/90" /> регистрации</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Ручные UTM -->
    <div v-if="manualUtm.length" class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
      <div class="px-5 py-3 border-b border-brand-border">
        <p class="text-sm font-bold text-white/85">Метки, поставленные вручную</p>
        <p class="text-[11px] text-white/40">Заходы с UTM-метками мимо этого раздела. Переходы для них не считаются, зато видно открытия сайта и путь зарегистрировавшихся до оплаты.</p>
      </div>
      <div class="overflow-x-auto">
        <div class="min-w-[560px]">
          <div class="px-5 py-2 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_repeat(5,3.5rem)] gap-2 text-[10px] font-bold uppercase tracking-wide text-white/30 border-b border-brand-border">
            <span>Источник</span><span>Кампания</span><span class="text-right">Визиты</span><span class="text-right">Регистр.</span><span class="text-right">Почта</span><span class="text-right">Онборд.</span><span class="text-right">Оплата</span>
          </div>
          <div class="divide-y divide-brand-border">
            <div v-for="(m, i) in manualUtm" :key="i" class="px-5 py-2.5 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_repeat(5,3.5rem)] gap-2 items-center text-xs">
              <span class="text-white/80 font-semibold truncate">{{ m.source || '—' }}</span>
              <span class="text-white/50 truncate">{{ m.campaign || '—' }}</span>
              <span class="text-white font-bold text-right">{{ m.visitors }}</span>
              <span class="text-white font-bold text-right">{{ m.signups }}</span>
              <span class="text-white/70 text-right">{{ m.verified }}</span>
              <span class="text-white/70 text-right">{{ m.onboarded }}</span>
              <span class="text-white/70 text-right">{{ m.paid }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Как работает защита -->
    <div class="rounded-3xl border border-brand-border p-5 md:p-6" style="background:#1F223C">
      <p class="text-sm font-bold text-white">Как мы не теряем трафик</p>
      <div class="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
        <div v-for="t in [
          { title: 'Переход считает сервер', text: 'Он записывается в момент клика, до загрузки сайта. Закрытая вкладка или блокировщик его не отменят.' },
          { title: 'Источник не пропадает', text: 'Метки запоминаются на устройстве и привязываются к аккаунту после регистрации, в том числе через Google и другие входы.' },
          { title: 'Реклама не перебивает рекламу', text: 'Первый и последний источник хранятся отдельно, поэтому видно, откуда человек пришёл впервые.' },
          { title: 'Боты и повторы не считаются', text: 'Превью мессенджеров, роботы и повторные клики с одного устройства за 30 минут не попадают в статистику.' },
        ]" :key="t.title">
          <p class="text-xs font-bold text-white/80">{{ t.title }}</p>
          <p class="text-xs text-white/40 mt-1 leading-relaxed">{{ t.text }}</p>
        </div>
      </div>
      <p class="text-[11px] text-white/30 mt-4">Ссылки ведут только на страницы сайта. IP-адреса не хранятся, остаётся только необратимый хеш.</p>
    </div>
  </div>
</template>

<style scoped src="./admin-shared.css"></style>
