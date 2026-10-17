<script setup lang="ts">
import { useConfirm } from '@/composables/useConfirm'
import { useLangStore } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'

const { state, resolve } = useConfirm()
const langStore = useLangStore()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="state.visible"
        class="fixed inset-0 z-900 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
        @click.self="resolve(false)"
      >
        <div
          class="bg-brand-card border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
          :class="state.danger ? 'border-red-500/40' : 'border-brand-border'"
        >
          <div
            class="px-6 py-4 border-b flex items-center gap-3"
            :class="state.danger ? 'border-red-500/20' : 'border-brand-border'"
            :style="state.danger
              ? 'background:linear-gradient(90deg,rgba(239,68,68,0.1) 0%,transparent 100%)'
              : 'background:linear-gradient(90deg,rgba(76,103,207,0.1) 0%,transparent 100%)'"
          >
            <div
              class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              :class="state.danger ? 'bg-red-500/20' : 'bg-brand-accent/20'"
            >
              <BIcon name="TriangleAlert" class="w-4 h-4" :class="state.danger ? 'text-red-400' : 'text-brand-accent'" />
            </div>
            <h3 class="font-bold text-white text-sm">{{ state.title || langStore.t.confirmBtn }}</h3>
          </div>

          <div class="p-6 stack-y-5">
            <p class="text-sm text-white/70 whitespace-pre-line">{{ state.message }}</p>
            <div class="flex gap-3">
              <button
                type="button"
                @click="resolve(false)"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-white/20 transition-all"
              >{{ state.cancelText || langStore.t.cancel }}</button>
              <button
                type="button"
                @click="resolve(true)"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white transition-all"
                :style="state.danger ? 'background:rgba(239,68,68,0.85)' : 'background:linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%)'"
              >{{ state.confirmText || langStore.t.confirmBtn }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.25s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.96); }
</style>
