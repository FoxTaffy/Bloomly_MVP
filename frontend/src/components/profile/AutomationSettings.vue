<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import api from '@/api'

const router    = useRouter()
const toast     = ref('')

const scheduledCount = ref(0)
const draftCount     = ref(0)
async function fetchScheduledCounts() {
  try {
    const res = await api.get('/posts/scheduled')
    const posts: { status: string }[] = res.data?.data?.posts ?? []
    scheduledCount.value = posts.filter(p => p.status === 'scheduled' || p.status === 'failed').length
    draftCount.value = posts.filter(p => p.status === 'draft').length
  } catch {}
}

interface AutoSettings {
  autoFollowBack:   boolean
  autoRepost:       boolean
  muteKeywords:     string[]
  quietHoursOn:     boolean
  quietFrom:        string
  quietTo:          string
  notifyNewFan:     boolean
  notifyComment:    boolean
  notifyRepaw:      boolean
  filterNsfw:       boolean
  filterSpam:       boolean
}

// filterNsfw stays local-only on purpose: it overlaps the separate verified-18+ NSFW
// gate (useNsfwMode.ts) and was deliberately excluded from the backend automation settings.
const NSFW_LS_KEY = 'bloomly_automation_filter_nsfw'

function defaultSettings(): AutoSettings {
  return {
    autoFollowBack:   false,
    autoRepost:       false,
    muteKeywords:     [],
    quietHoursOn:     false,
    quietFrom:        '23:00',
    quietTo:          '08:00',
    notifyNewFan:     true,
    notifyComment:    true,
    notifyRepaw:      false,
    filterNsfw:       localStorage.getItem(NSFW_LS_KEY) === 'true',
    filterSpam:       true,
  }
}

const s = ref<AutoSettings>(defaultSettings())

// camelCase (frontend) <-> snake_case (backend) field name mapping.
// filterNsfw/autoRepost never round-trip the API — they aren't backend-backed.
const API_KEY: Partial<Record<keyof AutoSettings, string>> = {
  autoFollowBack: 'auto_follow_back',
  muteKeywords:   'mute_keywords',
  quietHoursOn:   'quiet_hours_enabled',
  quietFrom:      'quiet_hours_from',
  quietTo:        'quiet_hours_to',
  notifyNewFan:   'notify_new_fan',
  notifyComment:  'notify_comment',
  notifyRepaw:    'notify_repaw',
  filterSpam:     'filter_spam',
}

function fromApi(data: Record<string, any>): Partial<AutoSettings> {
  return {
    autoFollowBack: data.auto_follow_back,
    muteKeywords:   data.mute_keywords,
    quietHoursOn:   data.quiet_hours_enabled,
    quietFrom:      data.quiet_hours_from,
    quietTo:        data.quiet_hours_to,
    notifyNewFan:   data.notify_new_fan,
    notifyComment:  data.notify_comment,
    notifyRepaw:    data.notify_repaw,
    filterSpam:     data.filter_spam,
  }
}

onMounted(async () => {
  try {
    const { data } = await api.get('/automation/me')
    Object.assign(s.value, fromApi(data.data.settings))
  } catch { /* keep local defaults if the fetch fails */ }
  fetchScheduledCounts()
})

async function patchSettings(partial: Partial<AutoSettings>): Promise<boolean> {
  const body: Record<string, any> = {}
  for (const k of Object.keys(partial) as (keyof AutoSettings)[]) {
    const apiKey = API_KEY[k]
    if (apiKey) body[apiKey] = partial[k]
  }
  if (!Object.keys(body).length) return true
  try {
    await api.patch('/automation/me', body)
    return true
  } catch (e) {
    showToast(apiErrorMessage(e) || 'Не удалось сохранить')
    return false
  }
}

function toggleProp(key: keyof AutoSettings) {
  const next = !s.value[key]
  ;(s.value as any)[key] = next

  if (key === 'filterNsfw') {
    localStorage.setItem(NSFW_LS_KEY, String(next))
    showToast('Сохранено')
    return
  }
  if (!API_KEY[key]) { showToast('Сохранено'); return } // e.g. autoRepost (soon, locked in UI)

  patchSettings({ [key]: next } as Partial<AutoSettings>).then((ok) => {
    if (ok) showToast('Сохранено')
    else (s.value as any)[key] = !next // revert on rejection
  })
}

async function saveQuietHours() {
  await patchSettings({ quietFrom: s.value.quietFrom, quietTo: s.value.quietTo })
}

function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2200)
}

// Mute keywords
const newKeyword = ref('')
async function addKeyword() {
  const kw = newKeyword.value.trim()
  if (!kw || s.value.muteKeywords.includes(kw)) return
  const next = [...s.value.muteKeywords, kw]
  if (await patchSettings({ muteKeywords: next })) {
    s.value.muteKeywords = next
    newKeyword.value = ''
    showToast('Слово добавлено')
  }
}
async function removeKeyword(kw: string) {
  const next = s.value.muteKeywords.filter(k => k !== kw)
  if (await patchSettings({ muteKeywords: next })) s.value.muteKeywords = next
}

// Section definitions
const sections = computed(() => [
  {
    id: 'social',
    icon: 'Users',
    title: 'Социальная активность',
    color: 'text-brand-accent',
    bg: 'bg-brand-accent/10',
    items: [
      {
        key: 'autoFollowBack',
        icon: 'UserPlus',
        label: 'Автоподписка в ответ',
        desc: 'Автоматически подписываться на тех, кто подписался на тебя',
        soon: false
      },
    ]
  },
  {
    id: 'notify',
    icon: 'Bell',
    title: 'Умные уведомления',
    color: 'text-brand-yellow',
    bg: 'bg-brand-yellow/10',
    items: [
      { key: 'notifyNewFan', icon: 'UserCheck', label: 'Новый подписчик', desc: 'Push при новой подписке', soon: false },
      { key: 'notifyComment', icon: 'MessageSquare', label: 'Новый комментарий', desc: 'Уведомление о комментариях к постам', soon: false },
      { key: 'notifyRepaw', icon: 'Repeat2', label: 'Перелапили пост', desc: 'Уведомление при репосте', soon: false },
      { key: 'quietHoursOn', icon: 'Moon', label: 'Тихие часы', desc: 'Не беспокоить в выбранное время', soon: false },
    ]
  },
  {
    id: 'filter',
    icon: 'Shield',
    title: 'Фильтры и модерация',
    color: 'text-brand-success',
    bg: 'bg-brand-success/10',
    items: [
      { key: 'filterSpam', icon: 'Ban', label: 'Авто-фильтр спама', desc: 'Скрывать комментарии со спамом', soon: false },
      { key: 'filterNsfw', icon: 'EyeOff', label: 'Авто-скрытие NSFW', desc: 'Размытие NSFW постов в ленте по умолчанию', soon: false },
    ]
  },
  {
    id: 'schedule',
    icon: 'CalendarClock',
    title: 'Планировщик публикаций',
    color: 'text-brand-purple',
    bg: 'bg-brand-purple/10',
    items: [
      { key: 'autoRepost', icon: 'Repeat', label: 'Авто-репост', desc: 'Автоматически публиковать выбранный контент', soon: true },
    ]
  },
])
</script>

<template>
  <div class="stack-y-6">

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toast"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl border pointer-events-none bg-brand-success/10 border-brand-success/30 text-brand-success">
        {{ toast }}
      </div>
    </Transition>

    <p class="text-white/45 text-sm">Настрой правила и автодействия для своего аккаунта</p>

    <!-- Sections -->
    <div v-for="sec in sections" :key="sec.id"
      class="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden">

      <!-- Section header -->
      <div class="flex items-center gap-3 px-5 py-4 border-b border-brand-border/60">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center" :class="sec.bg">
          <BIcon :name="sec.icon" class="w-4.5 h-4.5" :class="sec.color" />
        </div>
        <h3 class="font-extrabold text-white text-sm">{{ sec.title }}</h3>
      </div>

      <!-- Items -->
      <div class="divide-y divide-brand-border/30">
        <div v-for="item in sec.items" :key="item.key"
          class="flex items-center gap-4 px-5 py-4">
          <div class="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center bg-brand-card/60">
            <BIcon :name="item.icon" class="w-4 h-4 text-white/50" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="font-bold text-sm text-white">{{ item.label }}</p>
              <span v-if="item.soon"
                class="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
                Скоро
              </span>
            </div>
            <p class="text-xs text-white/40 mt-0.5">{{ item.desc }}</p>
          </div>
          <!-- Toggle -->
          <button
            v-if="!item.soon"
            type="button"
            @click="toggleProp(item.key as any)"
            class="shrink-0 relative w-11 h-6 rounded-full transition-all duration-200"
            :class="(s as any)[item.key] ? 'bg-brand-accent' : 'bg-brand-border'"
          >
            <div class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200"
              :class="(s as any)[item.key] ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'" />
          </button>
          <span v-else class="shrink-0 w-11 h-6 rounded-full bg-brand-border/40 flex items-center justify-center">
            <BIcon name="Lock" class="w-3 h-3 text-white/25" />
          </span>
        </div>
      </div>

      <!-- Quiet hours time picker (if enabled) -->
      <div v-if="sec.id === 'notify' && s.quietHoursOn"
        class="px-5 pb-4 pt-0 border-t border-brand-border/30 mt-0">
        <div class="flex items-center gap-4 mt-3">
          <div class="flex-1">
            <label class="block text-xs font-bold text-white/50 mb-1.5">С</label>
            <input v-model="s.quietFrom" type="time" @change="saveQuietHours"
              class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white outline-hidden focus:border-brand-accent/60 scheme-dark" />
          </div>
          <div class="text-white/30 mt-5">—</div>
          <div class="flex-1">
            <label class="block text-xs font-bold text-white/50 mb-1.5">До</label>
            <input v-model="s.quietTo" type="time" @change="saveQuietHours"
              class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white outline-hidden focus:border-brand-accent/60 scheme-dark" />
          </div>
        </div>
      </div>
    </div>

    <!-- Mute keywords -->
    <div class="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden">
      <div class="flex items-center gap-3 px-5 py-4 border-b border-brand-border/60">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-error/10">
          <BIcon name="VolumeX" class="w-4.5 h-4.5 text-brand-error" />
        </div>
        <h3 class="font-extrabold text-white text-sm">Заглушённые слова</h3>
      </div>
      <div class="p-5 stack-y-3">
        <p class="text-xs text-white/40">Посты и комментарии с этими словами будут скрыты из ленты</p>

        <!-- Add keyword -->
        <div class="flex gap-2">
          <input
            v-model="newKeyword"
            type="text"
            class="flex-1 bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-hidden focus:border-brand-accent/60"
            placeholder="Добавить слово или фразу…"
            @keydown.enter="addKeyword"
          />
          <button type="button" @click="addKeyword"
            class="px-4 py-2.5 rounded-xl bg-brand-card border border-brand-border text-white text-sm font-bold hover:border-brand-accent/40 transition-colors flex items-center gap-1.5">
            <BIcon name="Plus" class="w-4 h-4" />
          </button>
        </div>

        <!-- Tags -->
        <div v-if="s.muteKeywords.length" class="flex flex-wrap gap-2">
          <div v-for="kw in s.muteKeywords" :key="kw"
            class="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl bg-brand-error/8 border border-brand-error/20 text-brand-error text-xs font-bold">
            {{ kw }}
            <button type="button" @click="removeKeyword(kw)"
              class="w-4 h-4 rounded-full hover:bg-brand-error/20 flex items-center justify-center transition-colors">
              <BIcon name="X" class="w-3 h-3" />
            </button>
          </div>
        </div>
        <p v-else class="text-xs text-white/25 italic">Список пуст</p>
      </div>
    </div>

    <!-- Scheduled posts -->
    <div class="relative overflow-hidden bg-brand-bg border border-brand-border rounded-2xl p-6">
      <div class="absolute inset-0 bg-linear-to-r/srgb from-brand-purple/8 to-brand-accent/5 pointer-events-none" />
      <div class="relative flex items-start gap-4">
        <div class="w-12 h-12 rounded-2xl bg-brand-purple/15 flex items-center justify-center shrink-0">
          <BIcon name="CalendarClock" class="w-6 h-6 text-brand-purple" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="font-extrabold text-white">Отложенные публикации</h3>
            <span v-if="scheduledCount" class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
              {{ scheduledCount }} запланировано
            </span>
            <span v-if="draftCount" class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple border border-brand-purple/20">
              {{ draftCount }} черновиков
            </span>
          </div>
          <p class="text-sm text-white/45 leading-relaxed">
            Планируй публикации на нужное время — посты будут выходить автоматически по расписанию.
            Поддержка текста, медиа, NSFW-меток и рубрик.
          </p>
          <div class="flex flex-wrap gap-2 mt-3">
            <span v-for="feat in ['Расписание по дате/времени', 'Повторяющиеся посты', 'Черновики', 'Таймзоны']"
              :key="feat"
              class="text-[11px] px-2.5 py-1 rounded-xl bg-brand-purple/8 border border-brand-purple/15 text-brand-purple/70">
              {{ feat }}
            </span>
          </div>
          <button
            @click="router.push('/scheduled-posts')"
            class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-brand-purple text-white hover:brightness-110 transition-all"
          >
            <BIcon name="CalendarClock" class="w-3.5 h-3.5" />
            Открыть отложенные публикации
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
</style>
