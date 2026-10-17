<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="fixed inset-0 z-9999 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/85 backdrop-blur-xs" @click="$emit('cancel')"></div>
        <div class="relative z-10 bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-[640px] overflow-hidden select-none">
          <!-- header -->
          <div class="px-6 py-4 border-b border-brand-border flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background:rgba(76,151,207,0.18)">
                <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <div>
                <h3 class="font-bold text-white text-sm">{{ type === 'avatar' ? 'Обрезать аватар' : 'Обрезать баннер' }}</h3>
                <p class="text-[11px] text-white/55">{{ hint || (type === 'avatar' ? 'Квадрат 1:1 · Перемещайте и масштабируйте' : 'Прямоугольник 3:1 · Перемещайте и масштабируйте') }}</p>
              </div>
            </div>
            <button @click="$emit('cancel')"
              class="w-8 h-8 rounded-xl flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- crop area -->
          <div class="p-4">
            <cropper
              v-if="show && src"
              ref="cropperRef"
              class="crop-viewport"
              :src="src"
              :stencil-component="stencilShape === 'circle' ? CircleStencil : RectangleStencil"
              :stencil-props="{ aspectRatio: type === 'avatar' ? 1 : 3, movable: true, resizable: true }"
              image-restriction="stencil"
            />
          </div>

          <!-- zoom controls -->
          <div class="px-6 flex items-center justify-center gap-3 pb-2">
            <button type="button" @click="zoom(0.85)"
              class="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-all border border-brand-border">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/></svg>
            </button>
            <span class="text-[11px] text-white/35">Масштаб</span>
            <button type="button" @click="zoom(1.15)"
              class="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-all border border-brand-border">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>

          <!-- footer -->
          <div class="px-6 py-4 border-t border-brand-border flex items-center justify-between">
            <p class="text-xs text-white/35">
              {{ type === 'avatar' ? 'Квадрат · Выход 400 × 400 px' : 'Прямоугольник · Выход 1200 px ширина' }}
            </p>
            <div class="flex gap-3">
              <button type="button" @click="$emit('cancel')"
                class="px-4 py-2 text-xs font-bold rounded-xl border border-brand-border text-white/55 hover:text-white hover:border-brand-muted/40 transition-all">
                Отмена
              </button>
              <button type="button" @click="onConfirm" :disabled="uploading"
                class="px-4 py-2 text-xs font-bold rounded-xl text-white transition-all disabled:opacity-50 shadow-lg flex items-center gap-2"
                :style="`background:${accentColor || '#4C97CF'};box-shadow:0 4px 16px ${accentColor || '#4C97CF'}44`">
                <span v-if="uploading" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
                {{ uploading ? 'Загрузка…' : 'Применить' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Cropper, CircleStencil, RectangleStencil } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

export interface CropRel { x: number; y: number; w: number; h: number }

const props = defineProps<{
  show: boolean
  src: string
  type: 'avatar' | 'banner'
  shape?: 'circle' | 'square'
  accentColor?: string
  uploading?: boolean
  hint?: string
}>()

const stencilShape = computed(() => props.shape ?? (props.type === 'avatar' ? 'circle' : 'square'))

const emit = defineEmits<{
  cancel: []
  confirm: [payload: { blob: Blob; rel: CropRel }]
}>()

const cropperRef = ref<InstanceType<typeof Cropper> | null>(null)

function zoom(factor: number) {
  cropperRef.value?.zoom(factor)
}

function onConfirm() {
  const result = cropperRef.value?.getResult()
  if (!result?.canvas) return

  const outW = props.type === 'avatar' ? 400 : 1200
  const outH = props.type === 'avatar' ? 400 : Math.round(1200 * (result.canvas.height / result.canvas.width))

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')!
  ctx.drawImage(result.canvas, 0, 0, outW, outH)

  out.toBlob(blob => {
    if (!blob) return
    const rel: CropRel = {
      x: result.coordinates.left / result.image.width,
      y: result.coordinates.top / result.image.height,
      w: result.coordinates.width / result.image.width,
      h: result.coordinates.height / result.image.height,
    }
    emit('confirm', { blob, rel })
  }, 'image/jpeg', 0.92)
}
</script>

<style scoped>
.crop-viewport {
  width: 100%;
  height: min(60vh, 420px);
  background: #000;
  border-radius: 1rem;
  overflow: hidden;
}

.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.25s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.96); }
</style>
