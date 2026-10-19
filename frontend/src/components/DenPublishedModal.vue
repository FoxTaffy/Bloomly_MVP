<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import BIcon from './BIcon.vue'
import { useLangStore } from '@/stores/lang'

// Окно после создания лота — в стиле поздравления с верификацией: «Опубликовано» + два выбора.
const props = defineProps<{ title: string; image?: string | null; isDraft?: boolean }>()
const emit = defineEmits<{ open: []; stay: [] }>()
const langStore = useLangStore()
const t = computed(() => langStore.t as Record<string, string>)

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') emit('stay') }
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-10000 flex items-center justify-center bg-black/70 backdrop-blur-xs px-4" @click.self="emit('stay')">
      <div role="dialog" aria-modal="true" aria-labelledby="den-published-title"
        class="dpm-card relative w-full max-w-md bg-brand-card border border-brand-border rounded-3xl shadow-2xl p-6 text-center overflow-hidden">
        <div class="dpm-halo" aria-hidden="true"></div>
        <div class="relative">
          <div class="dpm-icon relative w-20 h-20 mx-auto mb-4">
            <img v-if="image" :src="image" alt="" class="w-20 h-20 rounded-2xl object-cover" />
            <div v-else class="w-20 h-20 rounded-2xl bg-brand-bg flex items-center justify-center">
              <BIcon name="ShoppingBag" class="w-9 h-9 text-white/30" />
            </div>
            <span class="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center border-2 border-brand-card"
              :style="isDraft ? 'background:#64748b' : 'background: linear-gradient(135deg,#34d399,#059669)'">
              <BIcon :name="isDraft ? 'Pencil' : 'Check'" class="w-4 h-4 text-white" />
            </span>
          </div>
          <h2 id="den-published-title" class="text-xl font-extrabold text-white mb-1">
            {{ isDraft ? t.dealersDenDraftSavedTitle : t.dealersDenPublishedTitle }}
          </h2>
          <p class="text-sm text-white/60 mb-1 line-clamp-2 font-semibold">«{{ props.title }}»</p>
          <p class="text-sm text-white/45 mb-6">{{ isDraft ? t.dealersDenDraftSavedSub : t.dealersDenPublishedSub }}</p>

          <button v-if="!isDraft" type="button" @click="emit('open')"
            class="w-full py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-sm transition-colors inline-flex items-center justify-center gap-2">
            <BIcon name="ArrowRight" class="w-4 h-4" />{{ t.dealersDenGoToListing }}
          </button>
          <button type="button" @click="emit('stay')"
            :class="isDraft ? 'bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 text-sm rounded-2xl' : 'mt-2 py-2.5 text-sm font-semibold text-white/50 hover:text-white/80'"
            class="w-full transition-colors">{{ t.dealersDenStayInDen }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dpm-card { animation: dpm-rise .35s cubic-bezier(.2,1.2,.4,1) both; }
.dpm-halo {
  position: absolute; top: -80px; left: 50%; width: 260px; height: 260px; margin-left: -130px;
  background: radial-gradient(circle, rgba(52,211,153,.35), transparent 70%);
  animation: dpm-pulse 3s ease-in-out infinite;
}
.dpm-icon { animation: dpm-pop .6s cubic-bezier(.2,1.4,.4,1) both; filter: drop-shadow(0 0 22px rgba(52,211,153,.45)); }
@keyframes dpm-rise { from { transform: translateY(14px) scale(.96); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes dpm-pop { from { transform: scale(.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes dpm-pulse { 0%,100% { opacity: .6 } 50% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .dpm-card, .dpm-halo, .dpm-icon { animation: none } }
</style>
