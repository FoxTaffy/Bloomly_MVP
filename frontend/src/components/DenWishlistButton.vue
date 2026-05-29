<template>
  <button
    class="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all"
    :class="isWishlisted
      ? 'bg-brand-error/10 border-brand-error/30 text-brand-error'
      : 'bg-brand-card border-brand-border text-white/40 hover:border-brand-error/30 hover:text-brand-error'"
    :title="isWishlisted ? 'Убрать из вишлиста' : 'В вишлист'"
    :disabled="loading"
    @click.prevent="toggle"
  >
    <span class="text-sm leading-none">{{ isWishlisted ? '❤️' : '🤍' }}</span>
    <span v-if="count && count > 0">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDealersDenStore } from '../stores/dealersDen'

const props = defineProps<{
  listingId: string
  initialWishlisted?: boolean
  count?: number
}>()

const emit = defineEmits<{ (e: 'change', wishlisted: boolean): void }>()

const store        = useDealersDenStore()
const loading      = ref(false)
const isWishlisted = ref(props.initialWishlisted ?? false)
const localCount   = ref(props.count ?? 0)

async function toggle() {
  if (loading.value) return
  loading.value = true
  try {
    if (isWishlisted.value) {
      await store.removeFromWishlist(props.listingId)
      isWishlisted.value = false
      localCount.value = Math.max(0, localCount.value - 1)
    } else {
      await store.addToWishlist(props.listingId)
      isWishlisted.value = true
      localCount.value += 1
    }
    emit('change', isWishlisted.value)
  } finally {
    loading.value = false
  }
}
</script>
