<script setup lang="ts">
import { computed } from 'vue'
import { useLangStore } from '@/stores/lang'

// Плашка статуса заказов автора (перк Pro и Business): «🎨 Заказы открыты», лист ожидания или закрыто.
// С username плашка ведёт в магазин автора в Dealers' Den.
const props = withDefaults(defineProps<{
  status?: string | null
  username?: string | null
  /** Вести в магазин автора */
  link?: boolean
  size?: 'sm' | 'md'
}>(), { size: 'sm' })

const langStore = useLangStore()

const view = computed(() => {
  const t = langStore.t
  switch (props.status) {
    case 'open':     return { icon: '🎨', label: t.commissionsOpen,     cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' }
    case 'waitlist': return { icon: '⏳', label: t.commissionsWaitlist, cls: 'bg-amber-500/15 border-amber-500/40 text-amber-300' }
    case 'closed':   return { icon: '🔒', label: t.commissionsClosed,   cls: 'bg-white/5 border-white/15 text-white/50' }
    default:         return null
  }
})
const sizeCls = computed(() => (props.size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]'))
</script>

<template>
  <component
    :is="link && username ? 'router-link' : 'span'"
    v-if="view"
    :to="link && username ? { name: 'den-seller', params: { username } } : undefined"
    class="inline-flex items-center gap-1 rounded-lg border font-extrabold leading-none whitespace-nowrap shrink-0 align-middle"
    :class="[view.cls, sizeCls, link && username ? 'hover:brightness-125 transition' : '']"
    :title="view.label"
    @click.stop
  >
    <span aria-hidden="true">{{ view.icon }}</span>{{ view.label }}
  </component>
</template>
