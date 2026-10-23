<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'

// Жёлтая плашка: группа-продавец отключила безопасную сделку, оплата идёт на её страх и риск.
// `compact` — одна строка для карточки лота внутри поста.
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <div role="note" data-testid="safe-deals-warning"
    class="flex items-start gap-2 rounded-xl border border-brand-yellow/30 bg-brand-yellow/10 text-brand-yellow"
    :class="compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-3 text-xs'">
    <BIcon name="AlertTriangle" :class="compact ? 'w-3.5 h-3.5 mt-px' : 'w-4 h-4'" class="shrink-0" />
    <p class="leading-snug font-semibold">
      Автор не принимает безопасные платежи.<template v-if="!compact"> Деньги не удерживаются до подтверждения заказа — договаривайтесь об оплате на свой риск.</template>
    </p>
  </div>
</template>
