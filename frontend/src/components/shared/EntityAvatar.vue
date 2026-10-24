<script setup lang="ts">
import { computed } from 'vue'
import { onAvatarError } from '@/composables/useAvatarFallback'

// Аватар пользователя или группы: картинка либо цветной кружок с инициалом.
// Размер и рамку задаёт вызывающий (class), форму — square (группы — скруглённый квадрат).
const props = defineProps<{
  src?: string | null
  name?: string | null
  square?: boolean
}>()

const initial = computed(() => (props.name || '?').trim().charAt(0).toUpperCase() || '?')
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name ?? ''"
    class="object-cover shrink-0"
    :class="square ? 'rounded-xl' : 'rounded-full'"
    @error="onAvatarError"
  />
  <div
    v-else
    class="flex items-center justify-center shrink-0 bg-brand-accent/20 text-brand-accent font-bold"
    :class="square ? 'rounded-xl' : 'rounded-full'"
    aria-hidden="true"
  >
    {{ initial }}
  </div>
</template>
