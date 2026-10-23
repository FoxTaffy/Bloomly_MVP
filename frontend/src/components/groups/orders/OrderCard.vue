<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useNsfwMode } from '@/composables/useNsfwMode'
import * as fmt from '@/lib/format'
import type { Order } from '@/stores/groups'
import { STATUS_META, STATUSES, customerName, deadlineState, orderCover } from './orderMeta'

const props = defineProps<{ order: Order; dragging?: boolean; busy?: boolean }>()
const emit = defineEmits<{
  (e: 'open', order: Order): void
  (e: 'chat', order: Order): void
  (e: 'edit', order: Order): void
  (e: 'next', order: Order): void
  (e: 'remove', order: Order): void
  (e: 'dragstart', order: Order, ev: DragEvent): void
  (e: 'dragend'): void
}>()

const { nsfwMode } = useNsfwMode()

const cover = computed(() => orderCover(props.order))
const coverBlurred = computed(() => !!cover.value?.nsfw && nsfwMode.value !== 'show')
const deadline = computed(() => deadlineState(props.order))
const nextStatus = computed(() => {
  const i = STATUSES.indexOf(props.order.status)
  return i < STATUSES.length - 1 ? STATUSES[i + 1] : null
})

const characterAvatars = computed(() => (props.order.characters ?? []).slice(0, 3).map(c => ({
  url: c.images[0]?.url || c.extraImages[0] || c.user.avatar_url || '',
  nsfw: !!c.images[0]?.is_nsfw,
})).filter(a => a.url))

const payment = computed(() => {
  switch (props.order.payment_status) {
    case 'unpaid':    return { label: 'Ждёт оплаты',   cls: 'bg-amber-500/12 text-amber-400' }
    case 'reported':  return { label: 'Оплата отмечена', cls: 'bg-sky-500/12 text-sky-400' }
    case 'confirmed': return { label: 'Оплачено',      cls: 'bg-emerald-500/12 text-emerald-400' }
    default:          return null
  }
})
const amount = computed(() => {
  const { invoice_amount: a, invoice_currency: c } = props.order
  return a && c ? fmt.formatPrice(a, c) : null
})
</script>

<template>
  <article
    :draggable="!busy"
    class="group/card relative bg-brand-card border border-brand-border rounded-2xl overflow-hidden cursor-pointer transition-all hover:border-white/20 hover:-translate-y-px hover:shadow-lg"
    :class="{ 'opacity-40 scale-[0.98]': dragging, 'opacity-60 pointer-events-none': busy }"
    @click="emit('open', order)"
    @dragstart="emit('dragstart', order, $event)"
    @dragend="emit('dragend')">

    <!-- Превью работы -->
    <div v-if="cover" class="relative h-28 bg-brand-bg overflow-hidden">
      <img :src="cover.url" alt="" loading="lazy" draggable="false"
        class="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-105"
        :class="coverBlurred ? 'blur-xl scale-110' : ''" />
      <div class="absolute inset-0 bg-linear-to-t from-brand-card/90 via-transparent to-transparent" />
      <span v-if="order.references?.length"
        class="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-xs text-white/80">
        <BIcon name="Image" class="w-3 h-3" /> {{ order.references.length }}
      </span>
    </div>

    <div class="p-3.5">
      <h3 class="text-[13px] font-bold text-white leading-snug line-clamp-2">{{ order.title }}</h3>

      <div class="flex items-center gap-1.5 mt-1.5">
        <img v-if="order.customer.avatar_url" :src="order.customer.avatar_url" alt="" draggable="false"
          class="w-4 h-4 rounded-full object-cover shrink-0" />
        <span v-else class="w-4 h-4 rounded-full bg-white/10 shrink-0" />
        <span class="text-[11px] text-white/50 truncate">{{ customerName(order) }}</span>
      </div>

      <p v-if="order.description" class="text-[11px] text-white/40 mt-2 leading-relaxed line-clamp-2">{{ order.description }}</p>

      <!-- Метки: срок, оплата, сумма -->
      <div class="flex flex-wrap items-center gap-1.5 mt-3">
        <span v-if="order.deadline_at"
          class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg"
          :class="{
            'bg-brand-error/15 text-brand-error': deadline === 'overdue',
            'bg-amber-500/15 text-amber-400': deadline === 'soon',
            'bg-white/6 text-white/50': !deadline,
          }">
          <BIcon name="Clock" class="w-3 h-3" /> {{ fmt.formatDate(order.deadline_at, 'short', 'ru-RU') }}
        </span>
        <span v-if="payment" class="inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-lg" :class="payment.cls">
          {{ payment.label }}
        </span>
        <span v-if="amount" class="text-[10px] font-bold text-white/60 ml-auto">{{ amount }}</span>
      </div>

      <!-- Персонажи -->
      <div v-if="characterAvatars.length" class="flex items-center mt-3 -space-x-1.5">
        <img v-for="(a, i) in characterAvatars" :key="i" :src="a.url" alt="" draggable="false"
          class="w-6 h-6 rounded-full object-cover border-2 border-brand-card"
          :class="a.nsfw && nsfwMode !== 'show' ? 'blur-xs' : ''" />
      </div>
    </div>

    <!-- Действия -->
    <div class="flex items-center gap-1 px-2.5 py-2 border-t border-brand-border bg-black/10" @click.stop>
      <button type="button" title="Чат с заказчиком"
        class="w-7 h-7 flex items-center justify-center rounded-lg text-white/45 hover:text-white hover:bg-white/8 transition-colors"
        @click="emit('chat', order)">
        <BIcon name="MessageCircle" class="w-3.5 h-3.5" />
      </button>
      <button type="button" title="Изменить"
        class="w-7 h-7 flex items-center justify-center rounded-lg text-white/45 hover:text-white hover:bg-white/8 transition-colors"
        @click="emit('edit', order)">
        <BIcon name="Pencil" class="w-3.5 h-3.5" />
      </button>
      <button type="button" title="Удалить"
        class="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-brand-error hover:bg-brand-error/10 transition-colors"
        @click="emit('remove', order)">
        <BIcon name="Trash2" class="w-3.5 h-3.5" />
      </button>
      <button v-if="nextStatus" type="button"
        class="ml-auto inline-flex items-center gap-1 text-[11px] font-bold pl-2.5 pr-2 py-1.5 rounded-lg transition-colors hover:brightness-125"
        :style="{ background: STATUS_META[nextStatus].color + '1f', color: STATUS_META[nextStatus].color }"
        @click="emit('next', order)">
        {{ STATUS_META[nextStatus].label }} <BIcon name="ArrowRight" class="w-3 h-3" />
      </button>
    </div>
  </article>
</template>
