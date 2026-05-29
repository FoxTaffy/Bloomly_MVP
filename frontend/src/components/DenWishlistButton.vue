<template>
  <button
    class="wishlist-btn"
    :class="{ wishlisted: isWishlisted }"
    :title="isWishlisted ? 'Убрать из вишлиста' : 'Добавить в вишлист'"
    @click.prevent="toggle"
    :disabled="loading"
  >
    <span class="icon">{{ isWishlisted ? '❤️' : '🤍' }}</span>
    <span v-if="count !== undefined" class="count">{{ displayCount }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDealersDenStore } from '../stores/dealersDen'

const props = defineProps<{
  listingId: string
  initialWishlisted?: boolean
  count?: number
}>()

const emit = defineEmits<{ (e: 'change', wishlisted: boolean): void }>()

const store = useDealersDenStore()
const loading = ref(false)
const isWishlisted = ref(props.initialWishlisted ?? false)
const localCount   = ref(props.count ?? 0)

const displayCount = computed(() => localCount.value > 0 ? localCount.value : '')

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

<style scoped>
.wishlist-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1.5px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
  font-weight: 500;
  color: #6b7280;
}
.wishlist-btn:hover         { border-color: #f87171; background: #fef2f2; color: #dc2626; }
.wishlist-btn.wishlisted    { border-color: #f87171; background: #fef2f2; color: #dc2626; }
.wishlist-btn:disabled      { opacity: 0.6; cursor: not-allowed; }
.icon { font-size: 16px; line-height: 1; }
.count { font-size: 13px; }
</style>
