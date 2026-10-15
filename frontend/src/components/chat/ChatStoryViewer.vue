<script setup lang="ts">
import { computed } from 'vue'
import { useLangStore } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'
import type { StoryReplyMeta } from '@/lib/chatMessage'

const props = defineProps<{ card: StoryReplyMeta | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const langStore = useLangStore()

// "5ч 12м" left until the story expires
const expiresIn = computed(() => {
  if (!props.card?.expiresAt) return ''
  const diff = Math.max(0, new Date(props.card.expiresAt).getTime() - Date.now())
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}${langStore.t.chatHourAbbr} ${m}${langStore.t.chatMinuteAbbr}` : `${m}${langStore.t.chatMinuteAbbr}`
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-250 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="card"
        class="fixed inset-0 z-[800] flex items-center justify-center bg-black/90 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <!-- Story phone frame -->
        <div
          class="relative flex flex-col bg-black rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10"
          style="aspect-ratio:9/16; height:min(90vh,600px)"
        >
          <!-- Background blur -->
          <div class="absolute inset-0 overflow-hidden">
            <img
              v-if="card.imageUrl"
              :src="card.imageUrl"
              class="w-full h-full object-cover scale-110 blur-2xl opacity-30 pointer-events-none"
              aria-hidden="true"
            />
            <div class="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
          </div>

          <!-- Main image -->
          <div class="flex-1 relative flex items-center justify-center overflow-hidden">
            <img
              v-if="card.imageUrl"
              :src="card.imageUrl"
              class="w-full h-full object-cover"
              draggable="false"
            />
            <div v-else class="flex flex-col items-center gap-3 text-white/30">
              <BIcon name="ImageOff" class="w-12 h-12" />
              <span class="text-xs">{{ langStore.t.chatImageUnavailableLabel }}</span>
            </div>
          </div>

          <!-- Top bar: author + expiry + close -->
          <div class="absolute top-0 left-0 right-0 z-10 flex items-center gap-2.5 px-3 pt-3 pb-4 bg-gradient-to-b from-black/70 to-transparent">
            <!-- Avatar -->
            <div class="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 flex-shrink-0 bg-brand-accent/20">
              <img
                v-if="card.authorAvatar"
                :src="card.authorAvatar"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-sm font-bold text-white">
                {{ (card.authorName || '?')[0].toUpperCase() }}
              </div>
            </div>
            <!-- Name + expiry -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-white leading-tight truncate">
                {{ card.authorName }}
              </p>
              <div class="flex items-center gap-1 text-[11px] text-white/55">
                <BIcon name="Sparkles" class="w-3 h-3" />
                <span>{{ langStore.t.story }}</span>
                <span v-if="card.expiresAt" class="flex items-center gap-0.5 ml-1">
                  <BIcon name="Clock" class="w-3 h-3" />
                  {{ expiresIn }}
                </span>
              </div>
            </div>
            <!-- Close button -->
            <button
              @click="emit('close')"
              class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors flex-shrink-0"
            >
              <BIcon name="X" class="w-5 h-5" />
            </button>
          </div>

          <!-- Bottom: reply text if present -->
          <div
            v-if="card.replyText"
            class="absolute bottom-0 left-0 right-0 z-10 px-4 pb-5 pt-8 bg-gradient-to-t from-black/80 to-transparent"
          >
            <div class="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3">
              <p class="text-[10px] text-white/50 font-semibold uppercase tracking-wider mb-1">{{ langStore.t.chatReplyLabel }}</p>
              <p class="text-sm text-white leading-snug">{{ card.replyText }}</p>
            </div>
          </div>
        </div>

        <!-- Close hint -->
        <button
          @click="emit('close')"
          class="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <BIcon name="X" class="w-5 h-5" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>
