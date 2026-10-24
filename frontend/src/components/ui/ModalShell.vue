<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'

// Оболочка всех модалок витрин в стиле CreateGroupModal: затемнение, карточка rounded-3xl,
// крестик w-8 h-8 справа сверху, заголовок text-xl font-extrabold.
withDefaults(defineProps<{
  title: string
  subtitle?: string
  /** Tailwind max-w-* карточки */
  width?: string
  shaking?: boolean
  /** true — клик по затемнению закрывает окно; false — только подсвечивает (emit backdrop) */
  closeOnBackdrop?: boolean
}>(), { width: 'max-w-lg', closeOnBackdrop: true })

const emit = defineEmits<{ close: []; backdrop: [] }>()
</script>

<template>
  <Teleport to="body">
    <transition name="modal-fade" appear>
      <div class="fixed inset-0 z-999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        @click.self="closeOnBackdrop ? emit('close') : emit('backdrop')">
        <div role="dialog" aria-modal="true"
          class="modal-form relative bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-h-[94vh] flex flex-col overflow-hidden"
          :class="[width, { 'modal-shake': shaking }]">
          <div class="relative px-6 pt-6 pb-4 shrink-0">
            <button type="button" @click="emit('close')"
              class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors z-20">
              <BIcon name="X" class="w-4 h-4 text-white/50" />
            </button>
            <h2 class="text-xl font-extrabold text-white mb-1 pr-8">{{ title }}</h2>
            <p v-if="subtitle" class="text-white/40 text-xs line-clamp-1">{{ subtitle }}</p>
          </div>
          <div class="flex-1 overflow-y-auto px-6 pb-6 stack-y-4"><slot /></div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>
