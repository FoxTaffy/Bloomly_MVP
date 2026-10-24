<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'
import type { FlashType } from '@/composables/useFlash'

defineProps<{ flash: { type: FlashType; text: string } | null }>()
</script>

<template>
  <Teleport to="body">
    <transition name="flash">
      <div v-if="flash" role="status"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-9999 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xs text-sm font-bold max-w-[92vw]"
        :class="flash.type === 'ok'
          ? 'bg-brand-success/20 border-brand-success/30 text-brand-success'
          : 'bg-brand-error/20 border-brand-error/30 text-brand-error'">
        <BIcon :name="flash.type === 'ok' ? 'CheckCircle' : 'AlertCircle'" class="w-4 h-4 shrink-0" />
        {{ flash.text }}
      </div>
    </transition>
  </Teleport>
</template>
