<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import { useNsfwMode } from '@/composables/useNsfwMode'
import BIcon from '@/components/BIcon.vue'
import ModalShell from '@/components/ui/ModalShell.vue'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const t = computed(() => useLangStore().t)
const { canUseNsfw, enableNsfw } = useNsfwMode()

function confirm() {
  if (canUseNsfw.value) enableNsfw()
  else router.push('/settings/profile') // дата рождения подтверждается в профиле
  emit('close')
}
</script>

<template>
  <ModalShell :title="t.dealersDenNsfwContentLabel" width="max-w-sm" @close="emit('close')">
    <div class="flex flex-col items-center text-center">
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl mb-4 bg-brand-error/15 border border-brand-error/30">🔞</div>
      <p class="text-sm text-white/55 leading-relaxed">
        {{ t.dealersDenNsfwLotWarning }}<br>
        {{ canUseNsfw ? t.dealersDenEnableNsfwHint : t.dealersDenConfirmBirthDateHint }}
      </p>
    </div>
    <div class="px-4 py-3 rounded-2xl flex items-start gap-2.5 bg-brand-error/8 border border-brand-error/20">
      <BIcon name="AlertTriangle" class="w-4 h-4 text-brand-error shrink-0 mt-0.5" />
      <p class="text-xs text-brand-error/80 leading-relaxed">
        {{ t.dealersDenNsfwAgreeText }} <span class="text-brand-error font-semibold">{{ t.dealersDenPlatformRulesLabel }}</span>.
      </p>
    </div>
    <div class="flex gap-3">
      <button @click="emit('close')" class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white/50 bg-white/5 hover:bg-white/10 border border-brand-border transition-all">{{ t.cancel }}</button>
      <button @click="confirm" class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white transition-all shadow-lg bg-brand-error hover:opacity-90">
        {{ canUseNsfw ? t.dealersDenEnableNsfwBtn : t.dealersDenConfirmAgeBtn }}
      </button>
    </div>
  </ModalShell>
</template>
