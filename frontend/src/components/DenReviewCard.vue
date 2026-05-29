<template>
  <div class="den-review-card">
    <div class="review-header">
      <img v-if="review.reviewer.avatar_url" :src="review.reviewer.avatar_url" class="avatar" alt="" />
      <div v-else class="avatar avatar-placeholder">{{ initials }}</div>
      <div class="reviewer-info">
        <span class="username">{{ review.reviewer.display_name || review.reviewer.username }}</span>
        <span class="date">{{ formattedDate }}</span>
      </div>
      <div class="stars">
        <span v-for="i in 5" :key="i" :class="['star', { filled: i <= review.rating }]">★</span>
      </div>
    </div>

    <div v-if="review.tags.length" class="review-tags">
      <span v-for="tag in review.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>

    <p v-if="review.text" class="review-text">{{ review.text }}</p>

    <img v-if="review.photo_url" :src="review.photo_url" class="review-photo" alt="Review photo" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DenReview } from '../stores/dealersDen'

const props = defineProps<{ review: DenReview }>()

const initials = computed(() => {
  const name = props.review.reviewer.display_name || props.review.reviewer.username
  return name.slice(0, 2).toUpperCase()
})

const formattedDate = computed(() =>
  new Date(props.review.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
)
</script>

<style scoped>
.den-review-card {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fff;
}
.review-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.avatar-placeholder {
  background: #6366f1;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}
.reviewer-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.username { font-weight: 600; font-size: 14px; }
.date     { font-size: 12px; color: #9ca3af; }
.stars    { display: flex; gap: 2px; }
.star     { color: #d1d5db; font-size: 16px; }
.star.filled { color: #f59e0b; }
.review-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag {
  padding: 2px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
}
.review-text { font-size: 14px; color: #374151; margin: 0; line-height: 1.5; }
.review-photo {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: 8px;
}
</style>
