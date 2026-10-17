<script setup lang="ts">
import { ref } from 'vue'
import BIcon from '@/components/BIcon.vue'
import SoonBadge from './SoonBadge.vue'
import type { EventItem } from '@/stores/groups'

const props = defineProps<{
  event: EventItem
  username: string
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const showBadgePreview = ref(true)
</script>

<template>
  <Teleport to="body">
    <Transition name="popup">
      <div
        v-if="show"
        class="fixed inset-0 z-999 flex items-center justify-center p-4"
        @click.self="emit('cancel')"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-xs" />

        <!-- Dialog -->
        <div class="relative bg-brand-card border border-brand-border rounded-3xl p-6 max-w-sm w-full shadow-2xl z-10 animate-in">
          <!-- Close -->
          <button
            class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors"
            @click="emit('cancel')"
          >
            <BIcon name="X" class="w-4 h-4 text-white/50" />
          </button>

          <!-- Icon -->
          <div class="w-16 h-16 rounded-2xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center mx-auto mb-4">
            <BIcon name="Sparkles" class="w-8 h-8 text-brand-accent" />
          </div>

          <h2 class="text-xl font-extrabold text-white text-center mb-2">
            Хочешь добавить Soon?
          </h2>
          <p class="text-white/55 text-sm text-center mb-5 leading-relaxed">
            Это выделит тебя и покажет друзьям, что ты в теме!
          </p>

          <!-- Preview -->
          <div class="bg-brand-bg/60 border border-brand-border rounded-2xl p-4 mb-5">
            <p class="text-white/40 text-xs mb-2 font-semibold uppercase tracking-wide">Превью</p>
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center">
                <BIcon name="User" class="w-4 h-4 text-brand-accent-minus" />
              </div>
              <span class="text-white font-bold text-sm">{{ username }}</span>
              <SoonBadge :short-code="event.short_code" size="sm" />
            </div>
          </div>

          <!-- Toggle -->
          <label class="flex items-center gap-3 bg-brand-bg/40 border border-brand-border rounded-2xl p-3 mb-5 cursor-pointer select-none">
            <div class="flex-1">
              <p class="text-white font-bold text-sm">Отображение бейджа</p>
              <p class="text-white/40 text-xs">Показывать бейдж рядом с именем</p>
            </div>
            <button
              class="w-10 h-6 rounded-full transition-colors flex items-center p-0.5"
              :class="showBadgePreview ? 'bg-brand-success' : 'bg-brand-muted'"
              @click.prevent="showBadgePreview = !showBadgePreview"
            >
              <span
                class="w-5 h-5 rounded-full bg-white shadow-md transition-transform"
                :class="showBadgePreview ? 'translate-x-4' : 'translate-x-0'"
              />
            </button>
          </label>

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              class="flex-1 py-3 rounded-2xl bg-brand-bg border border-brand-border text-white/60 font-bold text-sm hover:bg-brand-border/50 transition-colors"
              @click="emit('cancel')"
            >
              Не сейчас
            </button>
            <button
              class="flex-1 py-3 rounded-2xl bg-brand-accent text-white font-bold text-sm hover:bg-brand-accent-plus transition-colors shadow-accent"
              @click="emit('confirm')"
            >
              Добавить
              <BIcon name="Sparkles" class="w-3.5 h-3.5 inline ml-1 -mt-0.5" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.animate-in {
  animation: popup-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes popup-in {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.popup-enter-active { transition: opacity 0.2s; }
.popup-leave-active { transition: opacity 0.15s; }
.popup-enter-from,
.popup-leave-to { opacity: 0; }
</style>
