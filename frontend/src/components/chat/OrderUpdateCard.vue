<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { ORDER_STAGE_LABEL, ORDER_STAGE_COLOR } from '@/lib/orderStages'
import type { OrderStatus } from '@/stores/groups'

// Карточка «заказ / заявка обновлены» от лица группы: что изменилось и кнопка «Подробнее»
const props = defineProps<{
  meta: { groupId: string; orderId?: string; listingId?: string; headline?: string; title?: string; changes?: string[]; stage?: OrderStatus }
  isMine?: boolean
}>()

const router = useRouter()
const stage = computed(() => props.meta.stage)
const declined = computed(() => !props.meta.orderId)

function open() {
  // slug в маршруте может быть и id группы — API группы принимает оба
  if (props.meta.orderId) router.push({ name: 'group-order', params: { slugOrId: props.meta.groupId, orderId: props.meta.orderId } })
  else if (props.meta.listingId) router.push(`/dealers-den/${props.meta.listingId}`)
}
</script>

<template>
  <div class="mb-0.5 w-[280px] max-w-full rounded-2xl overflow-hidden border border-brand-border bg-brand-bg shadow-xs"
    :class="isMine ? 'rounded-br-md' : 'rounded-bl-md'">
    <div class="flex items-center gap-2.5 px-3.5 pt-3">
      <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        :class="declined ? 'bg-white/8' : 'bg-brand-accent/20'">
        <BIcon :name="declined ? 'XCircle' : 'RefreshCw'" class="w-3.5 h-3.5" :class="declined ? 'text-white/50' : 'text-brand-accent'" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest">{{ meta.headline || 'Заказ обновлён' }}</p>
        <p v-if="meta.title" class="text-[12px] font-extrabold text-white truncate">{{ meta.title }}</p>
      </div>
    </div>

    <ul v-if="meta.changes?.length" class="px-3.5 pt-2.5 stack-y-1">
      <li v-for="(c, i) in meta.changes" :key="i" class="text-[12px] text-white/80 leading-snug flex gap-1.5">
        <span class="text-brand-accent shrink-0">•</span><span class="break-words min-w-0">{{ c }}</span>
      </li>
    </ul>

    <div v-if="stage" class="px-3.5 pt-2.5">
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border"
        :style="{ color: ORDER_STAGE_COLOR[stage], borderColor: ORDER_STAGE_COLOR[stage] + '40', background: ORDER_STAGE_COLOR[stage] + '1f' }">
        Этап: {{ ORDER_STAGE_LABEL[stage] }}
      </span>
    </div>

    <button type="button" @click.stop="open"
      class="w-full flex items-center justify-between px-3.5 py-2.5 mt-3 border-t border-white/6 text-[11px] font-bold text-brand-accent hover:bg-white/4 transition-colors">
      <span>Подробнее</span>
      <BIcon name="ChevronRight" class="w-4 h-4" />
    </button>
  </div>
</template>
