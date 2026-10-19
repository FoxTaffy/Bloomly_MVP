<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import OrderStartModal from '@/components/groups/OrderStartModal.vue'
import OrderEditModal from '@/components/groups/OrderEditModal.vue'
import { useGroupsStore, type OrderDetail, type OrderStatus } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { errorMessage } from '@/lib/apiError'
import { formatPrice } from '@/lib/format'
import { ORDER_STAGES, ORDER_STAGE_LABEL, ORDER_STAGE_COLOR, deadlineText, DEADLINE_TONE_CLASS } from '@/lib/orderStages'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const auth = useAuthStore()
const messages = useMessagesStore()
const nsfwMode = useNsfwMode().nsfwEnabled
const activeNav = ref('groups')

const order = ref<OrderDetail | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const actionError = ref('')
const showStart = ref(false)
const showEdit = ref(false)

const stageIndex = computed(() => order.value ? ORDER_STAGES.indexOf(order.value.status) : 0)
const isFinished = computed(() => order.value?.status === 'FINISHED')
const deadline = computed(() => order.value ? deadlineText(order.value.deadline_at, isFinished.value) : null)
const nextStatus = computed<OrderStatus | null>(() => {
  if (!order.value || isFinished.value) return null
  return ORDER_STAGES[stageIndex.value + 1] ?? null
})
const nextLabel = computed(() => {
  if (!order.value) return ''
  if (order.value.status === 'WAITING' && !order.value.started_at) return 'Начать работу'
  return nextStatus.value ? `Перевести: ${ORDER_STAGE_LABEL[nextStatus.value]}` : ''
})

const listingHidden = computed(() => !!order.value?.listing?.is_nsfw && !nsfwMode.value)

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Хронология заказа: отправная точка, старт работы, срок и готовность
const timeline = computed(() => {
  const o = order.value
  if (!o) return []
  return [
    { label: 'Заявка принята', date: fmtDate(o.created_at), done: true },
    { label: 'Взято в работу', date: fmtDate(o.started_at), done: !!o.started_at },
    { label: 'Срок', date: fmtDate(o.deadline_at), done: !!o.deadline_at && isFinished.value },
    { label: 'Готово', date: fmtDate(o.finished_at), done: isFinished.value },
  ]
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    // API группы работает по id, а в ссылке может быть slug
    const group = await groupsStore.loadGroup(route.params.slugOrId as string)
    if (!group) throw new Error('Группа не найдена')
    order.value = await groupsStore.fetchOrderDetail(group.id, route.params.orderId as string)
  } catch (e) {
    error.value = errorMessage(e) ?? 'Заказ не найден или недоступен'
  } finally {
    loading.value = false
  }
}

async function reload() {
  if (!order.value?.group) return
  order.value = await groupsStore.fetchOrderDetail(order.value.group.id, order.value.id)
}

async function moveTo(status: OrderStatus, deadlineAt?: string) {
  if (!order.value) return
  busy.value = true
  actionError.value = ''
  try {
    await groupsStore.updateOrderStatus(order.value.group!.id, order.value.id, status, deadlineAt)
    showStart.value = false
    await reload()
  } catch (e) {
    actionError.value = errorMessage(e) ?? 'Не удалось изменить этап'
  } finally {
    busy.value = false
  }
}

function onNext() {
  if (!order.value || !nextStatus.value) return
  if (!order.value.started_at) { actionError.value = ''; showStart.value = true; return }
  moveTo(nextStatus.value)
}

// Заказчик — к переписке с группой; группа — тоже чат от лица группы
async function openChat() {
  if (!order.value) return
  try {
    if (order.value.canManage) {
      await messages.openGroupThread(order.value.group!.id, order.value.customer_id)
    } else if (order.value.conversation_id) {
      await messages.selectConversation(order.value.conversation_id)
    }
    router.push({ name: 'messages' })
  } catch (e) {
    actionError.value = errorMessage(e) ?? 'Не удалось открыть чат'
  }
}

function back() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'groups' })
}

const isCustomer = computed(() => order.value?.customer_id === auth.user?.id)

watch(() => route.params.orderId, load)
onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader v-model:nsfwMode="nsfwMode" />

    <div class="max-w-6xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6 pb-28 md:pb-10">
      <AppSidebar v-model:activeNav="activeNav" />

      <main class="flex-1 min-w-0">
        <button class="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors" @click="back">
          <BIcon name="ArrowLeft" class="w-4 h-4" /> Назад
        </button>

        <div v-if="loading" class="text-center py-16">
          <div class="h-8 w-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>

        <div v-else-if="error || !order" class="text-center py-16 stack-y-3">
          <BIcon name="Package" class="w-8 h-8 text-white/20 mx-auto" />
          <p class="text-white/40 text-sm">{{ error || 'Заказ не найден' }}</p>
        </div>

        <template v-else>
          <!-- Шапка заказа -->
          <section class="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-card p-5 md:p-6">
            <div class="absolute inset-0 pointer-events-none opacity-60"
              :style="{ background: `radial-gradient(120% 140% at 0% 0%, ${ORDER_STAGE_COLOR[order.status]}26, transparent 60%)` }" />
            <div class="relative flex flex-wrap items-start gap-4">
              <img v-if="order.group?.avatar_url" :src="order.group.avatar_url" class="w-12 h-12 rounded-2xl object-cover border border-brand-border shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-[11px] font-bold text-white/40 uppercase tracking-widest">Заказ · {{ order.group?.name }}</p>
                <h1 class="text-xl md:text-2xl font-extrabold text-white leading-tight mt-1 break-words">{{ order.title }}</h1>
                <p class="text-xs text-white/45 mt-1.5 flex items-center gap-1.5">
                  Заказчик:
                  <router-link :to="`/profile/${order.customer.username}`" class="font-bold text-white/70 hover:text-brand-accent">
                    {{ order.customer.display_name || order.customer.username }}
                  </router-link>
                  <span v-if="order.fromApplication" class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-brand-accent/15 text-brand-accent border border-brand-accent/25">из заявки</span>
                </p>
              </div>
              <div class="flex flex-col items-end gap-2 shrink-0">
                <span class="text-xs font-extrabold px-3 py-1.5 rounded-xl border"
                  :style="{ color: ORDER_STAGE_COLOR[order.status], borderColor: ORDER_STAGE_COLOR[order.status] + '45', background: ORDER_STAGE_COLOR[order.status] + '1f' }">
                  {{ ORDER_STAGE_LABEL[order.status] }}
                </span>
                <span class="text-[11px] font-bold px-2.5 py-1 rounded-lg border" :class="DEADLINE_TONE_CLASS[deadline!.tone]">{{ deadline!.text }}</span>
              </div>
            </div>

            <!-- Этапы -->
            <ol class="relative grid grid-cols-5 gap-2 mt-6">
              <li v-for="(st, i) in ORDER_STAGES" :key="st" class="min-w-0">
                <div class="h-1.5 rounded-full transition-colors" :style="{ background: i <= stageIndex ? ORDER_STAGE_COLOR[order.status] : 'rgba(255,255,255,0.08)' }" />
                <p class="mt-2 text-[10px] md:text-[11px] font-bold truncate"
                  :class="i === stageIndex ? 'text-white' : i < stageIndex ? 'text-white/55' : 'text-white/30'">
                  {{ ORDER_STAGE_LABEL[st] }}
                </p>
              </li>
            </ol>

            <!-- Действия -->
            <div class="relative flex flex-wrap gap-2.5 mt-6">
              <button @click="openChat"
                class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-extrabold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
                style="background: linear-gradient(135deg, #4C67CF, #7c3aed)">
                <BIcon name="MessageCircle" class="w-4 h-4" /> {{ order.canManage ? 'Написать заказчику' : 'Чат с группой' }}
              </button>
              <template v-if="order.canManage">
                <button v-if="nextStatus" @click="onNext" :disabled="busy"
                  class="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-accent/40 bg-brand-accent/10 text-brand-accent font-bold text-sm hover:bg-brand-accent/15 disabled:opacity-40 transition-all">
                  <BIcon name="Play" class="w-4 h-4" /> {{ nextLabel }}
                </button>
                <button @click="showEdit = true"
                  class="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-border bg-brand-bg text-white/65 font-bold text-sm hover:text-white hover:border-white/25 transition-all">
                  <BIcon name="Pencil" class="w-4 h-4" /> Изменить
                </button>
              </template>
            </div>
            <p v-if="actionError" class="relative mt-3 text-xs text-brand-error bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ actionError }}</p>
          </section>

          <div class="grid lg:grid-cols-3 gap-5 mt-5">
            <!-- Левая колонка: детали -->
            <div class="lg:col-span-2 stack-y-5 min-w-0">
              <section v-if="order.description" class="rounded-3xl border border-brand-border bg-brand-card p-5">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-2">Описание</h2>
                <p class="text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words">{{ order.description }}</p>
              </section>

              <section v-if="order.application" class="rounded-3xl border border-brand-border bg-brand-card p-5">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-2">Сообщение из заявки</h2>
                <p class="text-sm text-white/75 leading-relaxed whitespace-pre-wrap break-words border-l-2 border-brand-accent/40 pl-3">{{ order.application.message }}</p>
              </section>

              <!-- Персонажи -->
              <section class="rounded-3xl border border-brand-border bg-brand-card p-5">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-3">Персонажи</h2>
                <div v-if="!order.characters.length" class="text-sm text-white/40">Персонажей нет — работа без указанного персонажа</div>
                <div class="stack-y-3">
                  <div v-for="(c, i) in order.characters" :key="i" class="rounded-2xl border border-brand-border bg-brand-bg p-4">
                    <div class="flex items-center gap-3">
                      <img v-if="c.user.avatar_url" :src="c.user.avatar_url" class="w-10 h-10 rounded-xl object-cover shrink-0" />
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-extrabold text-white truncate">{{ c.fursona?.name || c.user.display_name || c.user.username }}</p>
                        <router-link :to="`/profile/${c.user.username}`" class="text-[11px] text-white/40 hover:text-brand-accent">@{{ c.user.username }}</router-link>
                      </div>
                      <span v-if="c.fursona?.species?.length" class="text-[10px] text-white/45 truncate max-w-[40%]">{{ c.fursona.species.join(', ') }}</span>
                    </div>
                    <div v-if="c.images.length || c.extraImages.length" class="flex flex-wrap gap-2 mt-3">
                      <a v-for="img in c.images.map(i => i.url)" :key="img" :href="img" target="_blank" rel="noopener" class="block">
                        <img :src="img" class="w-24 h-24 md:w-28 md:h-28 rounded-xl object-cover border border-white/10 hover:border-brand-accent/50 transition-colors" />
                      </a>
                      <a v-for="img in c.extraImages" :key="img" :href="img" target="_blank" rel="noopener" class="block">
                        <img :src="img" class="w-24 h-24 md:w-28 md:h-28 rounded-xl object-cover border border-brand-accent/30 hover:border-brand-accent transition-colors" />
                      </a>
                    </div>
                    <p v-else class="text-[11px] text-white/35 mt-3">Рефа нет — художник смотрит профиль персонажа</p>
                  </div>
                </div>
              </section>

              <!-- Референсы художника -->
              <section class="rounded-3xl border border-brand-border bg-brand-card p-5">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-3">Референсы к заказу</h2>
                <div v-if="!order.references.length" class="text-sm text-white/40">Пока нет</div>
                <div v-else class="flex flex-wrap gap-2">
                  <a v-for="img in order.references" :key="img" :href="img" target="_blank" rel="noopener" class="block">
                    <img :src="img" class="w-24 h-24 md:w-28 md:h-28 rounded-xl object-cover border border-white/10 hover:border-brand-accent/50 transition-colors" />
                  </a>
                </div>
              </section>
            </div>

            <!-- Правая колонка: хронология, лот, контакты -->
            <aside class="stack-y-5 min-w-0">
              <section class="rounded-3xl border border-brand-border bg-brand-card p-5">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-3">Хронология</h2>
                <ol class="relative stack-y-4 pl-5">
                  <li v-for="(t, i) in timeline" :key="i" class="relative">
                    <span class="absolute -left-5 top-1 w-2.5 h-2.5 rounded-full border-2"
                      :class="t.done ? 'bg-brand-accent border-brand-accent' : 'bg-transparent border-white/20'" />
                    <span v-if="i < timeline.length - 1" class="absolute -left-[17px] top-4 w-px h-full bg-white/10" />
                    <p class="text-sm font-bold" :class="t.done ? 'text-white' : 'text-white/35'">{{ t.label }}</p>
                    <p class="text-[11px] text-white/45">{{ t.date || '—' }}</p>
                  </li>
                </ol>
              </section>

              <section v-if="order.listing" class="rounded-3xl border border-brand-border bg-brand-card p-5">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-3">Лот</h2>
                <router-link :to="`/dealers-den/${order.listing.id}`"
                  class="flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-bg p-2.5 hover:border-brand-accent/40 transition-colors">
                  <div class="w-14 h-14 rounded-xl overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
                    <img v-if="order.listing.images[0] && !listingHidden" :src="order.listing.images[0]" class="w-full h-full object-cover" />
                    <BIcon v-else :name="listingHidden ? 'EyeOff' : 'Image'" class="w-5 h-5 text-white/25" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-bold text-white truncate">{{ listingHidden ? 'Скрыто · 18+' : order.listing.title }}</p>
                    <p class="text-xs font-black text-brand-yellow tabular-nums">{{ formatPrice(order.listing.price, order.listing.currency) }}</p>
                  </div>
                  <BIcon name="ExternalLink" class="w-4 h-4 text-white/35 shrink-0" />
                </router-link>
              </section>

              <section class="rounded-3xl border border-brand-border bg-brand-card p-5">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-3">Связь</h2>
                <p class="text-xs text-white/50 leading-relaxed">
                  <template v-if="isCustomer">Группа пишет вам от своего имени в чате «Группы».</template>
                  <template v-else>Пишите заказчику от имени группы — переписка появится у него во вкладке «Группы».</template>
                </p>
              </section>
            </aside>
          </div>

          <OrderStartModal v-if="showStart && order" :order="order" :avg-days="null" :busy="busy" :error="actionError"
            @close="showStart = false" @confirm="(d: string) => nextStatus && moveTo(nextStatus, d)" />
          <OrderEditModal v-if="showEdit && order && order.group" :group-id="order.group.id" :order="order"
            @close="showEdit = false" @saved="async () => { showEdit = false; await reload() }" />
        </template>
      </main>
    </div>
  </div>
</template>
