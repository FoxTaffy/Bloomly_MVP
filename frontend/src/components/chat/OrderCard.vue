<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useGroupsStore, type OrderDetail } from '@/stores/groups'
import { ORDER_STAGES, ORDER_STAGE_LABEL, ORDER_STAGE_COLOR, deadlineText, DEADLINE_TONE_CLASS } from '@/lib/orderStages'

// Карточка заказа в переписке группы: живой статус, открывается на странице заказа
const props = defineProps<{ orderId: string; groupId?: string; isMine?: boolean }>()

const router = useRouter()
const groupsStore = useGroupsStore()
const order = ref<OrderDetail | null>(null)
const loading = ref(true)
const failed = ref(false)

// Группа хранится в metadata сообщения; без неё (старые карточки) заказ не открыть
onMounted(async () => {
  try {
    if (!props.groupId) throw new Error('no group')
    order.value = await groupsStore.fetchOrderDetail(props.groupId, props.orderId)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})

const stageIndex = computed(() => order.value ? ORDER_STAGES.indexOf(order.value.status) : 0)
const deadline = computed(() => order.value ? deadlineText(order.value.deadline_at, order.value.status === 'FINISHED') : null)

function open() {
  if (!order.value?.group) return
  router.push({ name: 'group-order', params: { slugOrId: order.value.group.slug, orderId: order.value.id } })
}
</script>

<template>
  <div
    class="mb-0.5 w-[280px] max-w-full rounded-2xl overflow-hidden border border-brand-border bg-brand-bg shadow-xs"
    :class="[isMine ? 'rounded-br-md' : 'rounded-bl-md', order ? 'cursor-pointer hover:brightness-110 active:scale-[0.99] transition-all' : '']"
    @click.stop="open"
  >
    <div v-if="loading" class="flex items-center justify-center py-8">
      <BIcon name="Loader2" class="w-5 h-5 text-white/30 animate-spin" />
    </div>
    <div v-else-if="failed || !order" class="flex items-center gap-2 px-3.5 py-3 text-white/40 text-xs">
      <BIcon name="Package" class="w-4 h-4" /> Заказ недоступен
    </div>

    <template v-else>
      <!-- Шапка: группа и этап -->
      <div class="flex items-center gap-2.5 px-3.5 pt-3">
        <img v-if="order.group?.avatar_url" :src="order.group.avatar_url" class="w-7 h-7 rounded-lg object-cover shrink-0" />
        <div v-else class="w-7 h-7 rounded-lg bg-brand-accent/20 flex items-center justify-center shrink-0">
          <BIcon name="Package" class="w-3.5 h-3.5 text-brand-accent" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest">Заказ</p>
          <p class="text-[12px] font-extrabold text-white truncate">{{ order.title }}</p>
        </div>
        <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md border"
          :style="{ color: ORDER_STAGE_COLOR[order.status], borderColor: ORDER_STAGE_COLOR[order.status] + '40', background: ORDER_STAGE_COLOR[order.status] + '1f' }">
          {{ ORDER_STAGE_LABEL[order.status] }}
        </span>
      </div>

      <!-- Мини-прогресс по этапам -->
      <div class="flex items-center gap-1 px-3.5 pt-3">
        <div v-for="(st, i) in ORDER_STAGES" :key="st" class="flex-1 h-1.5 rounded-full transition-colors"
          :style="{ background: i <= stageIndex ? ORDER_STAGE_COLOR[order.status] : 'rgba(255,255,255,0.08)' }" />
      </div>

      <!-- Срок и персонажи -->
      <div class="flex items-center justify-between gap-2 px-3.5 pt-2.5">
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border truncate" :class="DEADLINE_TONE_CLASS[deadline!.tone]">
          {{ deadline!.text }}
        </span>
        <div v-if="order.characters.length" class="flex -space-x-2 shrink-0">
          <img v-for="(c, i) in order.characters.slice(0, 3)" :key="i"
            :src="c.images[0]?.url || c.extraImages[0] || c.user.avatar_url || ''"
            class="w-6 h-6 rounded-full object-cover border-2 border-brand-bg bg-brand-card" />
        </div>
      </div>

      <!-- Открыть -->
      <div class="flex items-center justify-between px-3.5 py-2.5 mt-2.5 border-t border-white/6 text-[11px] font-bold text-brand-accent">
        <span>Подробнее о заказе</span>
        <BIcon name="ChevronRight" class="w-4 h-4" />
      </div>
    </template>
  </div>
</template>
