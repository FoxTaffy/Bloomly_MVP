<script setup lang="ts">
import { computed } from 'vue'
import type { AvatarFrame } from '@/stores/dealersDen'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { fmtPrice } from '@/lib/shop'
import AvatarFrameOverlay from '@/components/AvatarFrameOverlay.vue'
import BIcon from '@/components/BIcon.vue'

const props = defineProps<{
  frame: AvatarFrame & { owned: boolean }
  busy?: boolean
  equipped?: boolean
  equipping?: boolean
}>()
defineEmits<{ claim: [frame: AvatarFrame]; equip: [frame: AvatarFrame] }>()

const auth = useAuthStore()
const langStore = useLangStore()

// Примерочная: рамка надета на аватарку того, кто зашёл в магазин
const avatar = computed(() => auth.avatarUrl || '/icons/badges/NN.jpg')
const calibration = computed(() => ({
  image_url: props.frame.image_url,
  offset_x: props.frame.default_offset_x,
  offset_y: props.frame.default_offset_y,
  scale: props.frame.default_scale,
  rotation: props.frame.default_rotation,
}))
// Рамка со сдвигом и масштабом выходит за аватар: сжимаем аватар так, чтобы вся рамка влезла в превью
const avatarSize = computed(() => {
  const f = calibration.value
  const reach = f.scale / 2 + Math.max(Math.abs(f.offset_x), Math.abs(f.offset_y))
  const fit = 0.9 / (2 * reach * 1.15) // 1.15 — запас на поворот
  return `${Math.round(Math.min(0.6, Math.max(0.25, fit)) * 100)}%`
})
const paid = computed(() => Number(props.frame.price) > 0)
</script>

<template>
  <div class="card-surface group hover:-translate-y-0.5 hover:border-brand-yellow/50 transition-all">
    <div class="relative aspect-square overflow-hidden flex items-center justify-center bg-linear-to-br from-brand-yellow/15 via-brand-bg to-brand-purple/15">
      <div class="relative aspect-square" :style="{ width: avatarSize }">
        <img :src="avatar" :alt="auth.displayName" @error="onAvatarError"
          class="w-full h-full rounded-full object-cover border border-white/10" />
        <AvatarFrameOverlay :frame="calibration" />
      </div>
      <span class="chip absolute top-2 left-2 bg-black/40 border-white/10 text-white/60">
        <BIcon name="Eye" class="w-2.5 h-2.5" /> Примерка
      </span>
      <span v-if="paid && !frame.owned" class="chip absolute top-2 right-2 bg-brand-yellow/20 border-brand-yellow/40 text-brand-yellow">
        {{ fmtPrice(frame.price) }}
      </span>
    </div>
    <div class="p-3 stack-y-2">
      <div>
        <p class="text-sm font-bold text-white truncate">{{ frame.name }}</p>
        <p class="text-[11px] text-white/40 truncate">{{ frame.creator.display_name ?? frame.creator.username }}</p>
      </div>
      <template v-if="frame.owned">
        <span v-if="equipped" class="w-full py-2 rounded-xl bg-brand-success/15 text-brand-success text-xs font-bold flex items-center justify-center gap-1">
          <BIcon name="Check" class="w-3.5 h-3.5" /> Надета
        </span>
        <button v-else @click="$emit('equip', frame)" :disabled="equipping"
          class="w-full py-2 rounded-xl bg-brand-gradient text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
          Надеть
        </button>
      </template>
      <button v-else @click="$emit('claim', frame)" :disabled="busy"
        class="w-full py-2 rounded-xl bg-brand-accent text-white text-xs font-bold hover:bg-brand-accent-plus transition-colors disabled:opacity-50">
        {{ paid ? `Купить · ${fmtPrice(frame.price)}` : langStore.t.avatarFrameClaimBtn }}
      </button>
    </div>
  </div>
</template>
