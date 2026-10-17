<template>
  <div class="flex flex-col items-center gap-4">
    <div
      ref="stageRef"
      class="relative rounded-full bg-brand-bg border border-brand-border overflow-visible"
      :style="{ width: size + 'px', height: size + 'px', touchAction: 'none', overscrollBehavior: 'contain', cursor: draggable ? (dragging ? 'grabbing' : 'grab') : 'default' }"
      @pointerdown="draggable && onPointerDown($event)"
    >
      <img :src="avatarUrl" class="absolute inset-0 w-full h-full rounded-full object-cover pointer-events-none select-none" draggable="false" />
      <img
        v-if="frameImageUrl"
        :src="frameImageUrl"
        class="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        :style="frameStyle"
        draggable="false"
      />
    </div>

    <div v-if="draggable" class="w-full max-w-xs stack-y-3">
      <div class="flex items-center gap-3">
        <span class="text-[10px] font-bold text-white/45 uppercase tracking-wider w-16 shrink-0">Размер</span>
        <input type="range" min="0.5" max="2" step="0.05" v-model.number="scale" class="flex-1 accent-brand-accent" />
      </div>
      <div class="flex items-center gap-3">
        <span class="text-[10px] font-bold text-white/45 uppercase tracking-wider w-16 shrink-0">Поворот</span>
        <input type="range" min="-180" max="180" step="1" v-model.number="rotation" class="flex-1 accent-brand-accent" />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-white/40">Перетащите рамку, чтобы сдвинуть</span>
        <button type="button" @click="reset" class="text-[11px] font-bold text-brand-accent hover:underline">Сбросить</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

export interface FrameCalibration {
  offsetX: number
  offsetY: number
  scale: number
  rotation: number
}

const props = withDefaults(defineProps<{
  avatarUrl: string
  frameImageUrl: string
  modelValue: FrameCalibration
  size?: number
  draggable?: boolean
}>(), {
  size: 200,
  draggable: true,
})

const emit = defineEmits<{ (e: 'update:modelValue', value: FrameCalibration): void }>()

const stageRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

const offsetX = computed({
  get: () => props.modelValue.offsetX,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, offsetX: v }),
})
const offsetY = computed({
  get: () => props.modelValue.offsetY,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, offsetY: v }),
})
const scale = computed({
  get: () => props.modelValue.scale,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, scale: v }),
})
const rotation = computed({
  get: () => props.modelValue.rotation,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, rotation: v }),
})

const frameStyle = computed(() => ({
  transform: `translate(${offsetX.value * 100}%, ${offsetY.value * 100}%) rotate(${rotation.value}deg) scale(${scale.value})`,
}))

function reset() {
  emit('update:modelValue', { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 })
}

const CLAMP = 0.5

function onPointerDown(e: PointerEvent) {
  if (!stageRef.value) return
  // Without this, the browser can start its own native image drag-and-drop gesture on
  // mousedown over the <img> layers, which steals the pointer gesture and made only
  // vertical movement look like it was ever taking effect.
  e.preventDefault()
  dragging.value = true
  const stage = stageRef.value
  stage.setPointerCapture(e.pointerId)
  const startX = e.clientX
  const startY = e.clientY
  const startOffsetX = offsetX.value
  const startOffsetY = offsetY.value
  const stageSize = stage.getBoundingClientRect().width || props.size

  function onMove(ev: PointerEvent) {
    // Keep suppressing native scroll/pan throughout the drag, not just at the start —
    // on touch devices a scrollable ancestor (any modal with overflow-y auto also computes
    // overflow-x as auto per the CSS spec) can otherwise still claim the horizontal
    // component of the gesture, leaving only vertical movement visibly working.
    ev.preventDefault()
    const dx = (ev.clientX - startX) / stageSize
    const dy = (ev.clientY - startY) / stageSize
    const nextOffsetX = Math.min(CLAMP, Math.max(-CLAMP, startOffsetX + dx))
    const nextOffsetY = Math.min(CLAMP, Math.max(-CLAMP, startOffsetY + dy))
    // Must emit both axes in one update, not via the two separate offsetX/offsetY computed
    // setters — each of those spreads props.modelValue to preserve the other fields, but a
    // prop update from a parent v-model assignment isn't reflected back synchronously within
    // the same tick. Calling them back-to-back meant the second call's spread still saw the
    // pre-drag value and clobbered whatever the first call had just set, so only the axis
    // updated last (Y) ever stuck — X always got reset back to its starting value.
    emit('update:modelValue', { ...props.modelValue, offsetX: nextOffsetX, offsetY: nextOffsetY })
  }
  function onUp(ev: PointerEvent) {
    dragging.value = false
    stage.releasePointerCapture(ev.pointerId)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
}
</script>
