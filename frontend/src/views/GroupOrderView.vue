<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import OrderStartModal from '@/components/groups/OrderStartModal.vue'
import OrderEditModal from '@/components/groups/OrderEditModal.vue'
import OrderProgressFeed from '@/components/groups/OrderProgressFeed.vue'
import WalletCard from '@/components/WalletCard.vue'
import { useGroupsStore, type OrderDetail, type OrderStatus } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useConfirm } from '@/composables/useConfirm'
import { errorMessage, apiErrorCode, apiErrorDetails, apiErrorMessage } from '@/lib/apiError'
import { formatPrice } from '@/lib/format'
import { ORDER_STAGES, ORDER_STAGE_LABEL, ORDER_STAGE_COLOR, deadlineText, DEADLINE_TONE_CLASS, orderStatePill } from '@/lib/orderStages'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const auth = useAuthStore()
const messages = useMessagesStore()
const nsfwMode = useNsfwMode().nsfwEnabled
const { confirmDialog } = useConfirm()
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
const statePill = computed(() => order.value ? orderStatePill(order.value) : null)
// Счёт выставлен, но оплата ещё не подтверждена художником: работа начнётся только после подтверждения
const needsPayment = computed(() => order.value?.payment_status === 'unpaid' || order.value?.payment_status === 'reported')
const hasInvoice = computed(() => !!order.value?.payment_status && order.value.payment_status !== 'none')
const payBusy = ref(false)
const nextStatus = computed<OrderStatus | null>(() => {
  if (!order.value || isFinished.value) return null
  return ORDER_STAGES[stageIndex.value + 1] ?? null
})
const nextLabel = computed(() => {
  if (!order.value) return ''
  if (needsPayment.value && order.value.status === 'WAITING') return 'Подтвердить оплату и начать'
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

async function confirmPayment(deadlineAt: string) {
  if (!order.value?.group) return
  busy.value = true
  actionError.value = ''
  try {
    await groupsStore.confirmOrderPayment(order.value.group.id, order.value.id, deadlineAt)
    showStart.value = false
    await reload()
  } catch (e) {
    actionError.value = errorMessage(e) ?? 'Не удалось подтвердить оплату'
  } finally {
    busy.value = false
  }
}

// Деньги удержаны на заказе и уходят художнику только после подтверждения заказчика
const escrowHeld = computed(() => order.value?.escrow_status === 'held')
const canConfirmCompletion = computed(() => isCustomer.value && isFinished.value && escrowHeld.value)
const insufficientFunds = ref(false)
const walletCardMounted = ref(false)
const walletCardRef = ref<InstanceType<typeof WalletCard> | null>(null)

async function openWalletTopup() {
  walletCardMounted.value = true
  await nextTick()
  walletCardRef.value?.openModal()
  walletCardRef.value?.startTopupPicker()
}

// Заказчик оплачивает счёт с кошелька: деньги списываются и удерживаются, художнику приходит уведомление
async function markPaid() {
  if (!order.value?.invoice_message_id) return
  payBusy.value = true
  actionError.value = ''
  insufficientFunds.value = false
  try {
    await messages.payRequest(order.value.invoice_message_id)
    await reload()
  } catch (e) {
    insufficientFunds.value = apiErrorCode(e) === 'INSUFFICIENT_FUNDS'
    const d = apiErrorDetails<{ needed?: number; balance?: number }>(e)
    actionError.value = insufficientFunds.value && d?.needed != null
      ? `Оплата не прошла: недостаточно средств — нужно ${d.needed} BLM, на балансе ${d.balance ?? 0} BLM.`
      : apiErrorMessage(e) ?? errorMessage(e) ?? 'Оплата не прошла'
    // Денег нет — сразу ведём на форму пополнения
    if (insufficientFunds.value) void openWalletTopup()
  } finally {
    payBusy.value = false
  }
}

function cancelPayFailure() {
  actionError.value = ''
  insufficientFunds.value = false
}

function contactSupport() {
  if (!order.value) return
  router.push({
    name: 'help',
    query: {
      subject: 'Проблема с оплатой заказа',
      message: `Заказ «${order.value.title}»\nID заказа: ${order.value.id}\nСумма: ${formatPrice(order.value.invoice_amount ?? 0, order.value.invoice_currency || 'RUB')}\n\nОпишите, что пошло не так:`,
    },
  })
}

async function confirmCompletion() {
  if (!order.value?.group) return
  if (!(await confirmDialog('Работа получена и вас всё устраивает? Оплата будет переведена художнику — отменить это нельзя.'))) return
  payBusy.value = true
  actionError.value = ''
  try {
    await groupsStore.confirmOrderCompletion(order.value.group.id, order.value.id)
    await reload()
  } catch (e) {
    actionError.value = apiErrorMessage(e) ?? errorMessage(e) ?? 'Не удалось подтвердить получение'
  } finally {
    payBusy.value = false
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
                  :style="{ color: statePill!.color, borderColor: statePill!.color + '45', background: statePill!.color + '1f' }">
                  {{ statePill!.label }}<template v-if="statePill!.label === 'В процессе'"> · {{ ORDER_STAGE_LABEL[order.status] }}</template>
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
                class="bg-brand-gradient flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-extrabold text-sm hover:opacity-90 active:scale-[0.98] transition-all">
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
            <p v-if="actionError && !(order.payment_status === 'unpaid' && !order.canManage)" class="relative mt-3 text-xs text-brand-error bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ actionError }}</p>
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

              <!-- Ход работы: скетчи, WIP и комментарии художника -->
              <section v-if="order.group" class="rounded-3xl border border-brand-border bg-brand-card p-5">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-3">Ход работы</h2>
                <OrderProgressFeed :group-id="order.group.id" :order-id="order.id" :current-stage="order.status"
                  :can-manage="order.canManage" :initial="order.progress" />
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
              <!-- Оплата: счёт выставляется при принятии заявки -->
              <section v-if="hasInvoice" class="rounded-3xl border p-5"
                :class="order.payment_status === 'confirmed' ? 'border-brand-success/30 bg-brand-success/5' : 'border-brand-accent/30 bg-brand-card'">
                <h2 class="text-[11px] font-bold text-white/45 uppercase tracking-widest mb-2">Оплата</h2>
                <p class="text-2xl font-extrabold text-white tabular-nums">{{ formatPrice(order.invoice_amount ?? 0, order.invoice_currency || 'RUB') }}</p>
                <p class="text-xs mt-1.5 leading-relaxed"
                  :class="order.payment_status === 'confirmed' ? 'text-brand-success font-bold' : 'text-white/55'">
                  <template v-if="order.escrow_status === 'released'">Работа принята — оплата переведена художнику</template>
                  <template v-else-if="order.escrow_status === 'refunded'">Оплата возвращена заказчику на кошелёк</template>
                  <template v-else-if="order.payment_status === 'confirmed' && escrowHeld">
                    {{ order.canManage ? 'Оплата удержана — она поступит вам, когда заказчик подтвердит готовую работу.' : 'Деньги удержаны безопасной сделкой и уйдут художнику, когда вы подтвердите готовую работу.' }}
                  </template>
                  <template v-else-if="order.payment_status === 'confirmed'">Оплата подтверждена — работа идёт</template>
                  <template v-else-if="order.payment_status === 'reported'">
                    {{ order.canManage ? 'Заказчик оплатил заказ, деньги удержаны. Подтвердите начало работы.' : 'Оплачено, деньги удержаны безопасной сделкой — ждём, пока художник подтвердит начало работы.' }}
                  </template>
                  <template v-else>
                    {{ order.canManage ? 'Счёт выставлен, ждём оплату от заказчика.' : 'Оплатите счёт с кошелька Bloom. Деньги удерживаются и уходят художнику только после вашего подтверждения работы.' }}
                  </template>
                </p>
                <button v-if="order.payment_status === 'unpaid' && !order.canManage && order.invoice_message_id" @click="markPaid" :disabled="payBusy"
                  class="bg-brand-gradient w-full mt-3 py-2.5 rounded-xl text-white font-extrabold text-sm hover:opacity-90 disabled:opacity-40 transition-all">
                  {{ payBusy ? 'Оплачиваем…' : 'Оплатить с кошелька' }}
                </button>
                <!-- Оплата не прошла: пополнить, отменить или написать в поддержку -->
                <div v-if="actionError && order.payment_status === 'unpaid' && !order.canManage" class="mt-3 rounded-xl border border-brand-error/30 bg-brand-error/10 px-3 py-2.5 stack-y-2">
                  <p class="text-xs text-white/75 leading-snug">{{ actionError }}</p>
                  <div class="flex flex-wrap gap-2">
                    <button v-if="insufficientFunds" @click="openWalletTopup" class="px-3 py-1.5 rounded-lg bg-brand-accent text-white text-xs font-bold hover:bg-brand-accent-plus transition-all">Пополнить кошелёк</button>
                    <button @click="cancelPayFailure" class="px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-xs font-bold hover:bg-white/15 transition-all">Отменить</button>
                  </div>
                </div>
                <button v-if="canConfirmCompletion" @click="confirmCompletion" :disabled="payBusy"
                  class="w-full mt-3 py-2.5 rounded-xl border border-brand-success/40 bg-brand-success/10 text-brand-success font-extrabold text-sm hover:bg-brand-success/15 disabled:opacity-40 transition-all">
                  Подтвердить получение работы
                </button>
                <button v-if="needsPayment && order.canManage" @click="showStart = true" :disabled="busy"
                  class="w-full mt-3 py-2.5 rounded-xl border border-brand-success/40 bg-brand-success/10 text-brand-success font-extrabold text-sm hover:bg-brand-success/15 disabled:opacity-40 transition-all">
                  Подтвердить оплату и начать работу
                </button>
                <button v-if="!order.canManage && order.payment_status !== 'none'" @click="contactSupport"
                  class="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-white/45 hover:text-white transition-colors">
                  <BIcon name="LifeBuoy" class="w-3.5 h-3.5" /> Написать в поддержку
                </button>
              </section>

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

          <div v-if="walletCardMounted" class="hidden"><WalletCard ref="walletCardRef" /></div>
          <OrderStartModal v-if="showStart && order" :order="order" :avg-days="null" :busy="busy" :error="actionError" :payment-confirm="needsPayment"
            @close="showStart = false" @confirm="(d: string) => needsPayment ? confirmPayment(d) : (nextStatus && moveTo(nextStatus, d))" />
          <OrderEditModal v-if="showEdit && order && order.group" :group-id="order.group.id" :order="order"
            @close="showEdit = false" @saved="async () => { showEdit = false; await reload() }" />
        </template>
      </main>
    </div>
  </div>
</template>
