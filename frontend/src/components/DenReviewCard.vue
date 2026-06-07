<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2.5">
      <img v-if="review.reviewer.avatar_url" :src="review.reviewer.avatar_url"
        class="w-8 h-8 rounded-full object-cover border border-brand-border flex-shrink-0"
        @error="onAvatarError" />
      <div v-else
        class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-extrabold border border-brand-border flex-shrink-0">
        {{ initials }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-bold text-white">{{ review.reviewer.display_name || review.reviewer.username }}</span>
          <span class="text-[10px] text-white/25">{{ formattedDate }}</span>
        </div>
        <div class="flex items-center gap-0.5 mt-0.5">
          <span v-for="i in 5" :key="i" class="text-sm" :class="i <= review.rating ? 'text-brand-yellow' : 'text-white/15'">★</span>
        </div>
      </div>
    </div>

    <div v-if="review.tags.length" class="flex flex-wrap gap-1.5">
      <span v-for="tag in review.tags" :key="tag"
        class="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-accent/10 border border-brand-accent/20 text-brand-accent">
        {{ tag }}
      </span>
    </div>

    <p v-if="review.text" class="text-sm text-white/65 leading-relaxed">{{ review.text }}</p>

    <img v-if="review.photo_url" :src="review.photo_url"
      class="w-full max-h-48 object-cover rounded-xl border border-brand-border" alt="" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DenReview } from '../stores/dealersDen'
import { onAvatarError } from '@/composables/useAvatarFallback'

const props = defineProps<{ review: DenReview }>()

const initials = computed(() =>
  (props.review.reviewer.display_name || props.review.reviewer.username).slice(0, 2).toUpperCase()
)
const formattedDate = computed(() =>
  new Date(props.review.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
)
</script>
