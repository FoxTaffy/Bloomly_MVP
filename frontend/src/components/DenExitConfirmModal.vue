<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import BIcon from './BIcon.vue'
import { useLangStore } from '@/stores/lang'

// «Точно хотите выйти?» при закрытии формы нового лота. Оболочка — как у CreateGroupModal.
const props = defineProps<{ canSaveDraft: boolean; busy?: boolean }>()
const emit = defineEmits<{ draft: []; discard: []; stay: [] }>()
const langStore = useLangStore()
const t = computed(() => langStore.t as Record<string, string>)

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') emit('stay') }
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-10000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" @click.self="emit('stay')">
      <div role="dialog" aria-modal="true" aria-labelledby="den-exit-title"
        class="relative w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl p-6 text-center">
        <button type="button" @click="emit('stay')" class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors">
          <BIcon name="X" class="w-4 h-4 text-white/50" />
        </button>
        <div class="w-14 h-14 rounded-2xl bg-brand-yellow/10 border border-brand-yellow/25 flex items-center justify-center mx-auto mb-4">
          <BIcon name="Pencil" class="w-6 h-6 text-brand-yellow" />
        </div>
        <h2 id="den-exit-title" class="text-xl font-extrabold text-white mb-1">{{ t.dealersDenExitTitle }}</h2>
        <p class="text-sm text-white/50 mb-6">{{ canSaveDraft ? t.dealersDenExitSub : t.dealersDenExitSubNoDraft }}</p>

        <div class="stack-y-2">
          <button v-if="canSaveDraft" type="button" :disabled="busy" @click="emit('draft')"
            class="w-full py-3 rounded-2xl text-white font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            :class="'bg-brand-gradient'">
            <BIcon name="Pencil" class="w-4 h-4" />{{ t.dealersDenExitSaveDraft }}
          </button>
          <button type="button" :disabled="busy" @click="emit('discard')"
            class="w-full py-3 rounded-2xl border border-brand-error/30 bg-brand-error/10 text-brand-error font-bold text-sm transition-colors hover:bg-brand-error/20 disabled:opacity-50">
            {{ canSaveDraft ? t.dealersDenExitDiscard : t.dealersDenExitLeave }}
          </button>
          <button type="button" @click="emit('stay')" class="w-full py-2 text-xs font-semibold text-white/40 hover:text-white/70 transition-colors">{{ t.dealersDenExitStay }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
