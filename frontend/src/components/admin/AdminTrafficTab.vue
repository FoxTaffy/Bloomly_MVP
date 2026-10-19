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
interface ManualUtm { source: string | null; campaign: string | null; visitors: number }
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
const SOURCES = ['telegram', 'vk', 'instagram', 'tiktok', 'youtube', 'google', 'yandex', 'twitter', 'blogger']
const MEDIUMS = ['cpc', 'social', 'banner', 'influencer', 'email', 'post', 'story']
const PAGES = [
  { path: '/', label: 'Главная' },
  { path: '/login', label: 'Вход и регистрация' },
]

const showForm = ref(false)
const form = ref(emptyForm())
const saving = ref(false)
const formError = ref('')

function emptyForm() {
  return { name: '', target_path: '/login', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', code: '' }
}

async function create() {
  saving.value = true
  formError.value = ''
  try {
    await api.post('/admin/tracking/links', form.value)
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
  { label: 'Клики', value: s.unique_clicks, base: s.unique_clicks },
  { label: 'Открыли сайт', value: s.visitors, base: s.unique_clicks },
  { label: 'Регистрации', value: s.signups, base: s.visitors },
  { label: 'Почта подтв.', value: s.verified, base: s.signups },
  { label: 'Онбординг', value: s.onboarded, base: s.verified },
  { label: 'Платные', value: s.paid, base: s.signups },
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
        { label: 'Уникальные клики', value: totals.unique_clicks, hint: `ботов отсеяно: ${totals.bots}` },
        { label: 'Открыли сайт', value: totals.visitors, hint: `конверсия клика ${pct(totals.visitors, totals.unique_clicks)}` },
        { label: 'Регистрации', value: totals.signups, hint: `из визитов ${pct(totals.signups, totals.visitors)}` },
        { label: 'Платные', value: totals.paid, hint: `из регистраций ${pct(totals.paid, totals.signups)}` },
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
          <b class="text-amber-300">{{ totals.lost_before_landing }}</b> кликов не дошли до загрузки сайта с меткой
          (закрыли вкладку, блокировщик, медленная сеть). Сервер их всё равно посчитал, так что воронка не теряет верхнюю часть.
        </p>
        <p v-if="totals.attribution_conflicts > 0">
          <b class="text-amber-300">{{ totals.attribution_conflicts }}</b> из {{ totals.attributed_signups }} регистраций побывали на нескольких рекламах.
          В таблице регистрация засчитана первой рекламе, а в строке ссылки видно, сколько раз она была последней.
        </p>
      </div>
    </div>

    <!-- Форма -->
    <form v-if="showForm" class="rounded-3xl border border-brand-border p-5 space-y-4" style="background:#1F223C" @submit.prevent="create">
      <p class="text-sm font-bold text-white/85">Новая рекламная ссылка</p>
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[11px] font-bold text-white/40">Название (для вас)</span>
          <input v-model="form.name" class="adm-input mt-1" maxlength="120" placeholder="Пост в канале @furry_news, октябрь" required />
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-white/40">Куда ведёт</span>
          <select v-model="form.target_path" class="adm-input mt-1">
            <option v-for="p in PAGES" :key="p.path" :value="p.path">{{ p.label }} ({{ p.path }})</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-white/40">utm_source — где размещено</span>
          <input v-model="form.utm_source" list="tr-sources" class="adm-input mt-1" maxlength="60" placeholder="telegram" required />
          <datalist id="tr-sources"><option v-for="s in SOURCES" :key="s" :value="s" /></datalist>
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-white/40">utm_medium — тип рекламы</span>
          <input v-model="form.utm_medium" list="tr-mediums" class="adm-input mt-1" maxlength="60" placeholder="cpc" required />
          <datalist id="tr-mediums"><option v-for="m in MEDIUMS" :key="m" :value="m" /></datalist>
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-white/40">utm_campaign — кампания</span>
          <input v-model="form.utm_campaign" class="adm-input mt-1" maxlength="100" placeholder="autumn_launch" required />
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-white/40">utm_content — креатив (необязательно)</span>
          <input v-model="form.utm_content" class="adm-input mt-1" maxlength="100" placeholder="video_a" />
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-white/40">utm_term — ключевое слово (необязательно)</span>
          <input v-model="form.utm_term" class="adm-input mt-1" maxlength="100" />
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-white/40">Свой код ссылки (необязательно)</span>
          <input v-model="form.code" class="adm-input mt-1" maxlength="40" placeholder="оставьте пустым — сгенерируется" />
        </label>
      </div>
      <p class="text-[11px] text-white/35">Только латиница, цифры и - _ . Регистр не важен. Метки и путь после создания не меняются: ссылка уже может стоять в рекламе.</p>
      <p v-if="formError" class="text-xs text-brand-error">{{ formError }}</p>
      <div class="flex gap-2">
        <button type="submit" :disabled="saving"
          class="px-4 py-2 rounded-xl text-xs font-bold bg-brand-accent text-white disabled:opacity-50 hover:brightness-110">
          {{ saving ? 'Создание…' : 'Создать' }}
        </button>
        <button type="button" @click="showForm = false" class="px-4 py-2 rounded-xl text-xs font-bold text-white/50 hover:text-white">Отмена</button>
      </div>
    </form>

    <!-- Список -->
    <div v-if="loading && !links.length" class="text-xs text-white/40">Загрузка…</div>
    <div v-else-if="!links.length" class="rounded-3xl border border-brand-border p-8 text-center text-sm text-white/40" style="background:#1F223C">
      Ссылок пока нет. Создайте первую — она сама проставит UTM-метки и посчитает клики.
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
            <p v-else class="text-[10px] text-white/35">ботов {{ l.stats.bots }}</p>
          </div>
        </div>
        <p v-if="l.stats.lost_before_landing > 0 || l.stats.last_touch_signups !== l.stats.signups" class="text-[11px] text-white/40">
          <template v-if="l.stats.lost_before_landing > 0">Не дошли до сайта: {{ l.stats.lost_before_landing }}. </template>
          <template v-if="l.stats.last_touch_signups !== l.stats.signups">
            Регистраций по первому касанию: {{ l.stats.signups }}, по последнему: {{ l.stats.last_touch_signups }}.
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
            <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm bg-brand-accent/80" /> клики</span>
            <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm bg-teal-400/80" /> открыли сайт</span>
            <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm bg-amber-400/90" /> регистрации</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Ручные UTM -->
    <div v-if="manualUtm.length" class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
      <div class="px-5 py-3 border-b border-brand-border">
        <p class="text-sm font-bold text-white/85">Метки, размеченные вручную</p>
        <p class="text-[11px] text-white/40">Заходы с utm_* без рекламной ссылки из этого раздела. Клики по ним не считаются, только визиты.</p>
      </div>
      <div class="divide-y divide-brand-border">
        <div v-for="(m, i) in manualUtm" :key="i" class="px-5 py-2.5 flex items-center gap-3 text-xs">
          <span class="text-white/80 font-semibold w-32 truncate">{{ m.source || '—' }}</span>
          <span class="text-white/50 flex-1 truncate">{{ m.campaign || '—' }}</span>
          <span class="text-white font-bold">{{ m.visitors }}</span>
        </div>
      </div>
    </div>

    <!-- Как работает защита -->
    <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
      <p class="text-sm font-bold text-white/85 mb-2">Защита от потери трафика</p>
      <ul class="text-xs text-white/50 space-y-1.5 list-disc pl-4">
        <li><b class="text-white/70">Клик пишет сервер</b> в момент перехода по короткой ссылке, до загрузки сайта. Блокировщики и закрытая вкладка его не отменят.</li>
        <li><b class="text-white/70">Метки не теряются:</b> если посредник срезал utm_*, ссылка находится по id клика. Метки хранятся на устройстве и привязываются к аккаунту после входа, в том числе через Google и другие OAuth.</li>
        <li><b class="text-white/70">Столкновения реклам:</b> первое и последнее касание хранятся отдельно, регистрация не достаётся случайному «победителю».</li>
        <li><b class="text-white/70">Боты и повторы:</b> превью мессенджеров, краулеры и повторные клики с того же устройства за 30 минут не попадают в уникальные клики.</li>
        <li><b class="text-white/70">Коды уникальны,</b> адрес назначения только внутри сайта: открытого редиректа нет. IP не хранится, только необратимый хеш.</li>
      </ul>
    </div>
  </div>
</template>

<style scoped src="./admin-shared.css"></style>
