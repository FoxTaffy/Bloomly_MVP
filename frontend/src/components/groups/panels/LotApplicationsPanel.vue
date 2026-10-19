<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useListingApplicationsStore, type ListingApplication, type ApplicationStatus } from '@/stores/listingApplications'
import { useMessagesStore } from '@/stores/messages'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { errorMessage } from '@/lib/apiError'
import { formatPrice } from '@/lib/format'
import { formatRelativeShort } from '@/lib/format'

const props = defineProps<{ groupId: string }>()

const router = useRouter()
const route = useRoute()
const store = useListingApplicationsStore()
const messages = useMessagesStore()
const nsfw = useNsfwMode().nsfwEnabled

type Filter = 'pending' | 'contacted' | 'accepted' | 'declined' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Новые' },
  { key: 'contacted', label: 'Обсуждаем' },
  { key: 'accepted', label: 'Приняты' },
  { key: 'declined', label: 'Отклонённые' },
  { key: 'all', label: 'Все' },
]

const items = ref<ListingApplication[]>([])
const filter = ref<Filter>('pending')
const loading = ref(true)
const error = ref('')
const busyId = ref<string | null>(null)

const pendingCount = computed(() => store.pendingByGroup[props.groupId] ?? 0)
const visible = computed(() => filter.value === 'all' ? items.value : items.value.filter(a => a.status === filter.value))

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = (await store.fetchForGroup(props.groupId)).applications
  } catch (e) {
    error.value = errorMessage(e) ?? 'Не удалось загрузить заявки'
  } finally {
    loading.value = false
  }
}

async function setStatus(app: ListingApplication, status: ApplicationStatus) {
  busyId.value = app.id
  try {
    const res = await store.setStatus(app.id, status)
    const wasPending = app.status === 'pending'
    app.status = res.status
    app.resolved_at = res.resolved_at
    if (wasPending !== (status === 'pending')) await store.fetchPendingCount(props.groupId)
  } catch (e) {
    alert('Ошибка: ' + errorMessage(e))
  } finally {
    busyId.value = null
  }
}

// Принять: заявка сама превращается в заказ в очереди («Ожидание») — заявитель получает уведомление
async function accept(app: ListingApplication) {
  await setStatus(app, 'accepted')
}

function openOrders() {
  router.push({ query: { ...route.query, tab: 'orders' } })
}

// Группа пишет заявителю первой: открываем чат и помечаем заявку «в работе».
async function writeToApplicant(app: ListingApplication) {
  busyId.value = app.id
  try {
    // Чат создаётся во вкладке «Группы» и пишет от имени группы, а не личным сообщением
    await messages.openGroupThread(props.groupId, app.applicant.id)
  } catch (e) {
    alert('Ошибка: ' + errorMessage(e))
    return
  } finally {
    busyId.value = null
  }
  if (app.status === 'pending') await setStatus(app, 'contacted')
  router.push({ name: 'messages' })
}

function countOf(f: Filter) {
  return f === 'all' ? items.value.length : items.value.filter(a => a.status === f).length
}

const STATUS_STYLE: Record<ApplicationStatus, { label: string; cls: string }> = {
  pending:   { label: 'Новая',     cls: 'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/25' },
  contacted: { label: 'Обсуждаем', cls: 'text-brand-accent bg-brand-accent/10 border-brand-accent/25' },
  accepted:  { label: 'Принята',   cls: 'text-brand-success bg-brand-success/10 border-brand-success/25' },
  declined:  { label: 'Отклонена', cls: 'text-white/40 bg-white/5 border-white/10' },
}

watch(() => props.groupId, load)
onMounted(load)
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-5 border-b border-brand-border flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style="background: linear-gradient(135deg, #4C67CF, #7c3aed)">
        <BIcon name="Send" class="w-5 h-5 text-white" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-extrabold text-white">Заявки на лоты</h1>
        <p class="text-xs text-white/40">Покупатели пишут сюда, а не в личные сообщения — вы отвечаете первыми, от лица группы</p>
      </div>
      <span v-if="pendingCount > 0"
        class="px-2.5 py-1 rounded-xl bg-brand-error/15 border border-brand-error/30 text-xs font-extrabold text-brand-error">
        {{ pendingCount }} нов.
      </span>
    </div>

    <!-- Filters -->
    <div class="px-6 pt-4 pb-1 flex items-center gap-2 flex-wrap">
      <button v-for="f in FILTERS" :key="f.key" @click="filter = f.key"
        :class="['px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border',
          filter === f.key ? 'bg-brand-accent/20 border-brand-accent/40 text-brand-accent'
                           : 'bg-white/4 border-brand-border text-white/50 hover:text-white hover:border-white/20']">
        {{ f.label }} <span class="opacity-60 tabular-nums">{{ countOf(f.key) }}</span>
      </button>
    </div>

    <div v-if="loading" class="px-6 py-12 flex justify-center">
      <div class="w-8 h-8 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
    </div>
    <div v-else-if="error" class="px-6 py-12 text-center text-brand-error text-sm">{{ error }}</div>

    <div v-else-if="!visible.length" class="px-6 py-16 flex flex-col items-center gap-3">
      <div class="w-14 h-14 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center">
        <BIcon name="Inbox" class="w-7 h-7 text-white/20" />
      </div>
      <p class="text-white/40 text-sm font-semibold">Заявок нет</p>
    </div>

    <!-- Cards -->
    <div v-else class="p-6 pt-4 stack-y-4">
      <article v-for="app in visible" :key="app.id"
        :class="['relative overflow-hidden rounded-2xl border bg-brand-bg/60 transition-colors',
          app.status === 'pending' ? 'border-brand-accent/35' : 'border-brand-border']">
        <div v-if="app.status === 'pending'" class="absolute inset-y-0 left-0 w-1 bg-brand-accent" />

        <!-- Applicant -->
        <div class="flex items-center gap-3 px-4 pt-4">
          <img v-if="app.applicant.avatar_url" :src="app.applicant.avatar_url"
            class="w-11 h-11 rounded-2xl object-cover border border-brand-border shrink-0" />
          <div v-else class="w-11 h-11 rounded-2xl bg-brand-accent/20 border border-brand-border flex items-center justify-center text-sm font-extrabold text-brand-accent shrink-0">
            {{ (app.applicant.display_name || app.applicant.username || '?')[0].toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <RouterLink :to="`/profile/${app.applicant.username}`"
              class="text-sm font-extrabold text-white truncate hover:text-brand-accent transition-colors flex items-center gap-1">
              {{ app.applicant.display_name || app.applicant.username }}
              <BIcon v-if="app.applicant.is_verified" name="BadgeCheck" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
            </RouterLink>
            <p class="text-xs text-white/40 truncate">@{{ app.applicant.username }} · {{ formatRelativeShort(app.created_at, { maxDays: 7, datePreset: 'numericShort', locale: 'ru-RU' }) }}</p>
          </div>
          <span :class="['shrink-0 px-2.5 py-1 rounded-xl border text-[11px] font-bold', STATUS_STYLE[app.status].cls]">
            {{ STATUS_STYLE[app.status].label }}
          </span>
        </div>

        <!-- Lot -->
        <RouterLink :to="`/dealers-den/${app.listing.id}`"
          class="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 p-2.5 hover:border-brand-accent/40 transition-colors">
          <div class="w-12 h-12 rounded-lg overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
            <img v-if="app.listing.images[0] && !(app.listing.is_nsfw && !nsfw)" :src="app.listing.images[0]" class="w-full h-full object-cover" />
            <BIcon v-else :name="app.listing.is_nsfw && !nsfw ? 'EyeOff' : 'Image'" class="w-5 h-5 text-white/25" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[10px] font-bold text-white/35 uppercase tracking-widest">Лот</p>
            <p class="text-sm font-bold text-white truncate">{{ app.listing.title }}</p>
          </div>
          <p class="text-sm font-black text-brand-yellow tabular-nums shrink-0">{{ formatPrice(app.listing.price, app.listing.currency) }}</p>
        </RouterLink>

        <!-- Message -->
        <div class="mx-4 mt-3 rounded-xl bg-white/4 border border-white/6 px-3.5 py-3">
          <p class="text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words">{{ app.message }}</p>
        </div>

        <!-- Characters -->
        <div v-if="app.characters.length" class="mx-4 mt-3 stack-y-2">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-widest">Персонажи</p>
          <div v-for="(c, i) in app.characters" :key="i" class="rounded-xl border border-white/8 bg-black/20 p-2.5">
            <div class="flex items-center gap-2.5">
              <img v-if="c.user.avatar_url" :src="c.user.avatar_url" class="w-8 h-8 rounded-lg object-cover shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-white truncate">{{ c.fursona?.name || c.user.display_name || c.user.username }}</p>
                <RouterLink :to="`/profile/${c.user.username}`" class="text-[11px] text-white/40 hover:text-brand-accent transition-colors">@{{ c.user.username }}</RouterLink>
              </div>
            </div>
            <div v-if="c.images.length || c.extraImages.length" class="flex flex-wrap gap-1.5 mt-2">
              <a v-for="img in [...c.images.map(i => i.url), ...c.extraImages]" :key="img" :href="img" target="_blank" rel="noopener">
                <img :src="img" class="w-14 h-14 rounded-lg object-cover border border-white/10 hover:border-brand-accent/50 transition-colors" />
              </a>
            </div>
            <p v-else class="text-[11px] text-white/35 mt-1.5">Рефа нет — смотрите профиль персонажа</p>
          </div>
        </div>

        <!-- Contact = applicant's account -->
        <p class="mx-4 mt-2 text-[11px] text-white/35 flex items-center gap-1.5">
          <BIcon name="AtSign" class="w-3 h-3" /> Для связи — аккаунт заявителя @{{ app.applicant.username }}
        </p>

        <!-- Actions -->
        <div v-if="app.status === 'accepted'" class="flex items-center gap-2 px-4 py-4">
          <p class="flex-1 text-xs text-brand-success font-bold flex items-center gap-1.5">
            <BIcon name="CheckCircle2" class="w-4 h-4" /> Принята — заказ в очереди, заявитель уведомлён
          </p>
          <button @click="openOrders"
            class="px-4 py-2.5 rounded-xl text-white font-extrabold text-xs hover:opacity-90 transition-all"
            style="background: linear-gradient(135deg, #4C67CF, #7c3aed)">К заказам</button>
        </div>
        <div v-else class="flex items-center gap-2 px-4 py-4 flex-wrap">
          <button v-if="app.status !== 'declined'" @click="accept(app)" :disabled="busyId === app.id"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-extrabold text-xs disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
            style="background: linear-gradient(135deg, #4C67CF, #7c3aed)">
            <BIcon name="Check" class="w-4 h-4" /> Принять в работу
          </button>
          <button @click="writeToApplicant(app)" :disabled="busyId === app.id || app.status === 'declined'"
            class="px-4 py-2.5 rounded-xl border border-brand-border text-white/70 text-xs font-bold hover:text-white hover:border-white/30 disabled:opacity-40 transition-all flex items-center gap-1.5">
            <BIcon name="MessageCircle" class="w-4 h-4" /> {{ app.status === 'contacted' ? 'Чат группы' : 'Написать от группы' }}
          </button>
          <button v-if="app.status !== 'declined'" @click="setStatus(app, 'declined')" :disabled="busyId === app.id"
            class="px-4 py-2.5 rounded-xl border border-brand-border text-white/50 text-xs font-bold hover:text-red-400 hover:border-red-400/40 disabled:opacity-40 transition-all">
            Отклонить
          </button>
          <button v-else @click="setStatus(app, 'pending')" :disabled="busyId === app.id"
            class="px-4 py-2.5 rounded-xl border border-brand-border text-white/50 text-xs font-bold hover:text-white hover:border-white/30 disabled:opacity-40 transition-all">
            Вернуть в новые
          </button>
        </div>
      </article>
    </div>
  </div>
</template>
