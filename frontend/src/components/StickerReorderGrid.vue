<script setup lang="ts" generic="T extends { key: string }">
/**
 * StickerReorderGrid — сетка с перетаскиванием элементов (pointer events: мышь, тач, перо).
 *  • мышь: тянем сразу после смещения на несколько пикселей
 *  • тач: долгое нажатие (~250 мс), чтобы не мешать прокрутке
 *  • остальные плитки плавно расступаются (FLIP через TransitionGroup)
 * Содержимое плитки задаётся слотом `tile`; элементы с атрибутом data-no-drag не запускают перетаскивание.
 */
import { ref, onBeforeUnmount } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ items: T[] }>()
const emit  = defineEmits<{ (e: 'update:items', v: T[]): void }>()

const root       = ref<HTMLElement | null>(null)
const draggingKey = ref<string | null>(null)
const ghost      = ref<{ x: number; y: number; w: number; h: number; item: T } | null>(null)

let pointerId = -1
let startX = 0, startY = 0
let grabDX = 0, grabDY = 0
let pending: { key: string; el: HTMLElement } | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null
let scroller: HTMLElement | null = null
let lastY = 0
let raf = 0
let suppressClick = false

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return null
}

function onPointerDown(e: PointerEvent, item: T) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  if ((e.target as HTMLElement).closest('[data-no-drag]')) return
  const el = (e.currentTarget as HTMLElement)
  pointerId = e.pointerId
  startX = e.clientX; startY = e.clientY
  pending = { key: item.key, el }
  const rect = el.getBoundingClientRect()
  grabDX = e.clientX - rect.left
  grabDY = e.clientY - rect.top
  if (e.pointerType !== 'mouse') {
    holdTimer = setTimeout(() => begin(item), 250)
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function begin(item: T) {
  if (!pending) return
  const rect = pending.el.getBoundingClientRect()
  draggingKey.value = item.key
  ghost.value = { x: rect.left, y: rect.top, w: rect.width, h: rect.height, item }
  scroller = scrollParent(root.value)
  // Блокируем прокрутку страницы пальцем, пока тянем плитку
  window.addEventListener('touchmove', blockScroll, { passive: false })
  if (navigator.vibrate) navigator.vibrate(8)
  raf = requestAnimationFrame(autoScroll)
}

function blockScroll(e: TouchEvent) { if (draggingKey.value) e.preventDefault() }

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  if (!draggingKey.value) {
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY)
    if (e.pointerType === 'mouse') {
      if (moved > 5 && pending) begin(props.items.find(i => i.key === pending!.key)!)
    } else if (moved > 10) {
      cancelPending() // палец поехал раньше долгого нажатия — это прокрутка
      return
    }
    if (!draggingKey.value) return
  }
  lastY = e.clientY
  if (ghost.value) {
    ghost.value.x = e.clientX - grabDX
    ghost.value.y = e.clientY - grabDY
  }
  // Какая плитка под курсором
  const under = document.elementsFromPoint(e.clientX, e.clientY)
    .find(n => n instanceof HTMLElement && n.dataset.key && root.value?.contains(n)) as HTMLElement | undefined
  const overKey = under?.dataset.key
  if (!overKey || overKey === draggingKey.value) return
  const list = [...props.items]
  const from = list.findIndex(i => i.key === draggingKey.value)
  const to   = list.findIndex(i => i.key === overKey)
  if (from < 0 || to < 0) return
  list.splice(to, 0, list.splice(from, 1)[0])
  emit('update:items', list)
}

function autoScroll() {
  if (!draggingKey.value) return
  if (scroller) {
    const r = scroller.getBoundingClientRect()
    const edge = 56
    if (lastY < r.top + edge)         scroller.scrollTop -= Math.ceil((r.top + edge - lastY) / 4)
    else if (lastY > r.bottom - edge) scroller.scrollTop += Math.ceil((lastY - (r.bottom - edge)) / 4)
  }
  raf = requestAnimationFrame(autoScroll)
}

function cancelPending() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  pending = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  cancelPending()
  if (draggingKey.value) {
    // После перетаскивания браузер шлёт click на плитку — гасим его, чтобы не сработал выбор
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 0)
  }
  draggingKey.value = null
  ghost.value = null
  cancelAnimationFrame(raf)
  window.removeEventListener('touchmove', blockScroll)
}

onBeforeUnmount(() => {
  cancelPending()
  cancelAnimationFrame(raf)
  window.removeEventListener('touchmove', blockScroll)
})
</script>

<template>
  <div ref="root">
    <TransitionGroup name="sticker-reorder" tag="div" v-bind="$attrs">
      <div v-for="(item, index) in items" :key="item.key" :data-key="item.key"
        class="reorder-tile touch-manipulation select-none"
        :class="draggingKey === item.key ? 'opacity-30' : ''"
        @pointerdown="onPointerDown($event, item)"
        @click.capture="(e: Event) => { if (suppressClick) { e.stopPropagation(); e.preventDefault() } }"
        @dragstart.prevent>
        <slot name="tile" :item="item" :index="index" :dragging="draggingKey === item.key" />
      </div>
    </TransitionGroup>

    <!-- Плитка, которая следует за пальцем -->
    <Teleport to="body">
      <div v-if="ghost" class="fixed z-200 pointer-events-none rounded-2xl overflow-hidden shadow-2xl ring-2 ring-brand-purple bg-[#1b1b30]/90 scale-105"
        :style="{ left: ghost.x + 'px', top: ghost.y + 'px', width: ghost.w + 'px', height: ghost.h + 'px' }">
        <slot name="ghost" :item="ghost.item" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sticker-reorder-move { transition: transform 0.22s cubic-bezier(.2, .8, .2, 1); }
.reorder-tile { transition: opacity 0.15s; }
</style>
