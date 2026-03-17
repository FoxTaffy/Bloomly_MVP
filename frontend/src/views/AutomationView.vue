<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'

const nsfwMode  = ref(false)
const activeNav = ref('automation')
const toast     = ref('')
const newReply  = ref('')
const addingReply = ref(false)

// ── Automation settings (localStorage) ────────────────────────────────────────
const LS_KEY = 'bloomly_automation_v1'

interface AutoSettings {
  autoFollowBack:   boolean
  welcomeMsg:       boolean
  welcomeText:      string
  autoRepost:       boolean
  muteKeywords:     string[]
  quietHoursOn:     boolean
  quietFrom:        string
  quietTo:          string
  notifyNewFan:     boolean
  notifyComment:    boolean
  notifyRepaw:      boolean
  quickReplies:     string[]
  filterNsfw:       boolean
  filterSpam:       boolean
}

function loadSettings(): AutoSettings {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') ?? defaultSettings()
  } catch { return defaultSettings() }
}

function defaultSettings(): AutoSettings {
  return {
    autoFollowBack:   false,
    welcomeMsg:       false,
    welcomeText:      'Привет! Спасибо что подписался 🐾',
    autoRepost:       false,
    muteKeywords:     [],
    quietHoursOn:     false,
    quietFrom:        '23:00',
    quietTo:          '08:00',
    notifyNewFan:     true,
    notifyComment:    true,
    notifyRepaw:      false,
    quickReplies:     ['Спасибо! 🐾', 'Очень мило!', 'Скоро отвечу 👀'],
    filterNsfw:       false,
    filterSpam:       true,
  }
}

const s = ref<AutoSettings>(loadSettings())
watch(s, (val) => { localStorage.setItem(LS_KEY, JSON.stringify(val)) }, { deep: true })

function toggleProp(key: keyof AutoSettings) {
  ;(s.value as any)[key] = !(s.value as any)[key]
  showToast('Сохранено')
}

function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2200)
}

// Mute keywords
const newKeyword = ref('')
function addKeyword() {
  const kw = newKeyword.value.trim()
  if (!kw || s.value.muteKeywords.includes(kw)) return
  s.value.muteKeywords.push(kw)
  newKeyword.value = ''
  showToast('Слово добавлено')
}
function removeKeyword(kw: string) {
  s.value.muteKeywords = s.value.muteKeywords.filter(k => k !== kw)
}

// Quick replies
function addQuickReply() {
  const t = newReply.value.trim()
  if (!t) return
  s.value.quickReplies.push(t)
  newReply.value = ''
  addingReply.value = false
  showToast('Шаблон добавлен')
}
function removeQuickReply(i: number) {
  s.value.quickReplies.splice(i, 1)
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
      {
        key: 'welcomeMsg',
        icon: 'MessageCircle',
        label: 'Приветственное сообщение',
        desc: 'Отправлять сообщение новым подписчикам',
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
  <div class="min-h-screen bg-brand-bg text-white font-nunito">

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toast"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl border pointer-events-none bg-brand-success/10 border-brand-success/30 text-brand-success">
        {{ toast }}
      </div>
    </Transition>

    <AppHeader v-model:nsfwMode="nsfwMode" />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar v-model:activeNav="activeNav" />

      <main class="flex-1 min-w-0 pb-28 md:pb-20 space-y-6">

        <!-- Header -->
        <div class="flex items-start justify-between pt-2">
          <div>
            <h1 class="text-3xl font-extrabold text-white flex items-center gap-3">
              <BIcon name="Zap" class="w-8 h-8 text-brand-yellow" />
              Автоматизация
            </h1>
            <p class="text-white/45 text-sm mt-1">Настрой правила и автодействия для своего аккаунта</p>
          </div>
        </div>

        <!-- Sections -->
        <div v-for="sec in sections" :key="sec.id"
          class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden">

          <!-- Section header -->
          <div class="flex items-center gap-3 px-5 py-4 border-b border-brand-border/60">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center" :class="sec.bg">
              <BIcon :name="sec.icon" class="w-4.5 h-4.5" :class="sec.color" />
            </div>
            <h2 class="font-extrabold text-white text-sm">{{ sec.title }}</h2>
          </div>

          <!-- Items -->
          <div class="divide-y divide-brand-border/30">
            <div v-for="item in sec.items" :key="item.key"
              class="flex items-center gap-4 px-5 py-4">
              <div class="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center bg-brand-bg/60">
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
                @click="toggleProp(item.key as any)"
                class="flex-shrink-0 relative w-11 h-6 rounded-full transition-all duration-200"
                :class="(s as any)[item.key] ? 'bg-brand-accent' : 'bg-brand-border'"
              >
                <div class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200"
                  :class="(s as any)[item.key] ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'" />
              </button>
              <span v-else class="flex-shrink-0 w-11 h-6 rounded-full bg-brand-border/40 flex items-center justify-center">
                <BIcon name="Lock" class="w-3 h-3 text-white/25" />
              </span>
            </div>
          </div>

          <!-- Welcome message text (if enabled) -->
          <div v-if="sec.id === 'social' && s.welcomeMsg"
            class="px-5 pb-4 pt-0 border-t border-brand-border/30">
            <label class="block text-xs font-bold text-white/50 mb-2 mt-3">Текст приветствия</label>
            <div class="flex gap-2">
              <input
                v-model="s.welcomeText"
                type="text"
                class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-brand-accent/60"
                placeholder="Привет! Спасибо за подписку 🐾"
              />
              <button @click="showToast('Сохранено')"
                class="px-4 py-2.5 rounded-xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus transition-colors">
                <BIcon name="Check" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Quiet hours time picker (if enabled) -->
          <div v-if="sec.id === 'notify' && s.quietHoursOn"
            class="px-5 pb-4 pt-0 border-t border-brand-border/30 mt-0">
            <div class="flex items-center gap-4 mt-3">
              <div class="flex-1">
                <label class="block text-xs font-bold text-white/50 mb-1.5">С</label>
                <input v-model="s.quietFrom" type="time"
                  class="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-brand-accent/60 [color-scheme:dark]" />
              </div>
              <div class="text-white/30 mt-5">—</div>
              <div class="flex-1">
                <label class="block text-xs font-bold text-white/50 mb-1.5">До</label>
                <input v-model="s.quietTo" type="time"
                  class="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-brand-accent/60 [color-scheme:dark]" />
              </div>
            </div>
          </div>
        </div>

        <!-- Mute keywords -->
        <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden">
          <div class="flex items-center gap-3 px-5 py-4 border-b border-brand-border/60">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-error/10">
              <BIcon name="VolumeX" class="w-4.5 h-4.5 text-brand-error" />
            </div>
            <h2 class="font-extrabold text-white text-sm">Заглушённые слова</h2>
          </div>
          <div class="p-5 space-y-3">
            <p class="text-xs text-white/40">Посты и комментарии с этими словами будут скрыты из ленты</p>

            <!-- Add keyword -->
            <div class="flex gap-2">
              <input
                v-model="newKeyword"
                type="text"
                class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-brand-accent/60"
                placeholder="Добавить слово или фразу…"
                @keydown.enter="addKeyword"
              />
              <button @click="addKeyword"
                class="px-4 py-2.5 rounded-xl bg-brand-card border border-brand-border text-white text-sm font-bold hover:border-brand-accent/40 transition-colors flex items-center gap-1.5">
                <BIcon name="Plus" class="w-4 h-4" />
              </button>
            </div>

            <!-- Tags -->
            <div v-if="s.muteKeywords.length" class="flex flex-wrap gap-2">
              <div v-for="kw in s.muteKeywords" :key="kw"
                class="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl bg-brand-error/8 border border-brand-error/20 text-brand-error text-xs font-bold">
                {{ kw }}
                <button @click="removeKeyword(kw)"
                  class="w-4 h-4 rounded-full hover:bg-brand-error/20 flex items-center justify-center transition-colors">
                  <BIcon name="X" class="w-3 h-3" />
                </button>
              </div>
            </div>
            <p v-else class="text-xs text-white/25 italic">Список пуст</p>
          </div>
        </div>

        <!-- Quick replies -->
        <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden">
          <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-brand-border/60">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-purple/10">
                <BIcon name="MessageSquareDashed" class="w-4.5 h-4.5 text-brand-purple" />
              </div>
              <h2 class="font-extrabold text-white text-sm">Быстрые ответы</h2>
            </div>
            <button @click="addingReply = true"
              class="text-xs font-bold text-brand-accent hover:text-brand-accent-plus transition-colors flex items-center gap-1">
              <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить
            </button>
          </div>

          <div class="p-5 space-y-2">
            <p class="text-xs text-white/40 mb-3">Шаблоны ответов, доступные в чатах одним кликом</p>

            <!-- Add form -->
            <div v-if="addingReply" class="flex gap-2 mb-3">
              <input
                v-model="newReply"
                type="text"
                class="flex-1 bg-brand-bg border border-brand-accent/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                placeholder="Текст шаблона…"
                @keydown.enter="addQuickReply"
                @keydown.esc="addingReply = false"
                autofocus
              />
              <button @click="addQuickReply"
                class="px-4 py-2.5 rounded-xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus transition-colors">
                <BIcon name="Check" class="w-4 h-4" />
              </button>
              <button @click="addingReply = false"
                class="px-3 py-2.5 rounded-xl bg-brand-card border border-brand-border text-white/50 text-sm hover:border-white/20 transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <!-- List -->
            <div v-for="(reply, i) in s.quickReplies" :key="i"
              class="group flex items-center gap-3 p-3 rounded-xl bg-brand-bg/60 border border-brand-border/50 hover:border-brand-border transition-colors">
              <BIcon name="MessageSquare" class="w-4 h-4 text-white/30 flex-shrink-0" />
              <span class="flex-1 text-sm text-white/75">{{ reply }}</span>
              <button @click="removeQuickReply(i)"
                class="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-brand-error/60 hover:bg-brand-error/10 hover:text-brand-error transition-all">
                <BIcon name="Trash2" class="w-3.5 h-3.5" />
              </button>
            </div>

            <p v-if="!s.quickReplies.length" class="text-xs text-white/25 italic text-center py-4">Нет шаблонов</p>
          </div>
        </div>

        <!-- Scheduled posts — coming soon banner -->
        <div class="relative overflow-hidden bg-brand-card border border-brand-border rounded-3xl p-6">
          <div class="absolute inset-0 bg-gradient-to-r from-brand-purple/8 to-brand-accent/5 pointer-events-none" />
          <div class="relative flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-brand-purple/15 flex items-center justify-center flex-shrink-0">
              <BIcon name="CalendarClock" class="w-6 h-6 text-brand-purple" />
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-extrabold text-white">Отложенные публикации</h3>
                <span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
                  Скоро
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
            </div>
          </div>
        </div>

      </main>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
</style>
