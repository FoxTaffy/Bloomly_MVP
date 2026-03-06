<script setup lang="ts">
/**
 * StickerUpload — upload PNG stickers with Telegram-compatible rules:
 *   • Format: PNG with transparent background (alpha channel)
 *   • Dimensions: exactly 512 × 512 px
 *   • Max file size: 100 KiB
 *
 * Validates on the client before uploading; also trusts the server's 422 validation error.
 * Emits `uploaded(url)` for every successfully uploaded sticker.
 */
import { ref } from 'vue'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'

const emit = defineEmits<{
  (e: 'uploaded', url: string): void
  (e: 'removed', url: string): void
}>()

const props = defineProps<{
  modelValue?: string[]  // existing URLs (from store)
}>()

// ── Types ─────────────────────────────────────────────────────────────────
type StickerEntry = {
  id:       string
  name:     string
  preview:  string           // object URL for local preview (data URL for completed)
  state:    'validating' | 'uploading' | 'done' | 'error'
  error?:   string
  url?:     string           // final CDN URL (state === 'done')
  sizeKb:   number
}

const MAX_BYTES = 100 * 1024  // 100 KiB
const DIM       = 512

const entries   = ref<StickerEntry[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const dragging  = ref(false)

// ── Helpers ──────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2)
}

/** Read File as ArrayBuffer; returns buffer + object URL */
function readFile(file: File): Promise<{ buffer: ArrayBuffer; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ buffer: reader.result as ArrayBuffer, objectUrl: URL.createObjectURL(file) })
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

/** Check PNG has alpha channel by reading colour-type byte at offset 25 */
function pngHasAlpha(buffer: ArrayBuffer): boolean {
  const view = new DataView(buffer)
  // PNG signature: 8 bytes, then IHDR chunk: 4 len + 4 type + 13 data
  // colour type byte is at offset 8+4+4+9 = 25
  const colourType = view.getUint8(25)
  // 4 = RGBA, 6 = RGBA, 2 = RGB, 3 = indexed, 0 = greyscale
  return colourType === 4 || colourType === 6
}

/** Load image and return its natural dimensions */
function getImageDimensions(objectUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = objectUrl
  })
}

// ── Core process ──────────────────────────────────────────────────────────

async function processFile(file: File) {
  const id: string = uid()
  const entry: StickerEntry = {
    id,
    name:    file.name,
    preview: '',
    state:   'validating',
    sizeKb:  Math.round(file.size / 1024 * 10) / 10,
  }
  entries.value.push(entry)

  const idx = entries.value.length - 1
  const set = (patch: Partial<StickerEntry>) => { Object.assign(entries.value[idx], patch) }

  // 1. Format
  if (file.type !== 'image/png') {
    URL.revokeObjectURL(entry.preview)
    set({ state: 'error', error: 'Только PNG' })
    return
  }

  // 2. Size
  if (file.size > MAX_BYTES) {
    set({ state: 'error', error: `Превышает 100 КБ (${entry.sizeKb} КБ)` })
    return
  }

  try {
    const { buffer, objectUrl } = await readFile(file)
    set({ preview: objectUrl })

    // 3. Alpha channel
    if (!pngHasAlpha(buffer)) {
      set({ state: 'error', error: 'Нет прозрачного фона (нужен PNG с альфа-каналом)' })
      return
    }

    // 4. Dimensions
    const { w, h } = await getImageDimensions(objectUrl)
    if (w !== DIM || h !== DIM) {
      set({ state: 'error', error: `Нужно 512×512 пикселей (получено ${w}×${h})` })
      return
    }

    // 5. Upload
    set({ state: 'uploading' })
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post('/media/upload?folder=stickers', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    const url: string = res.data.data.url
    set({ state: 'done', url, preview: objectUrl })
    emit('uploaded', url)

  } catch (err: any) {
    const msg: string =
      err?.response?.data?.error?.message ??
      err?.message ??
      'Ошибка загрузки'
    set({ state: 'error', error: msg })
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────

function onFiles(files: FileList | null) {
  if (!files) return
  Array.from(files).forEach(processFile)
  if (fileInput.value) fileInput.value.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  onFiles(e.dataTransfer?.files ?? null)
}

function removeEntry(e: StickerEntry, i: number) {
  if (e.url)     emit('removed', e.url)
  if (e.preview) URL.revokeObjectURL(e.preview)
  entries.value.splice(i, 1)
}
</script>

<template>
  <div class="space-y-3">

    <!-- Drop zone -->
    <div
      class="relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer select-none"
      :class="dragging
        ? 'border-brand-purple bg-brand-purple/10'
        : 'border-brand-border hover:border-brand-purple/50 hover:bg-brand-purple/5 bg-brand-bg'"
      @click="fileInput?.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop">

      <BIcon name="Sticker" class="w-10 h-10 mx-auto mb-2" :class="dragging ? 'text-brand-purple' : 'text-white/30'" />
      <p class="text-sm font-bold text-white/70 mb-1">
        Перетащите PNG-стикеры или <span class="text-brand-purple underline">выберите файлы</span>
      </p>

      <!-- Rules badge row -->
      <div class="flex flex-wrap gap-2 justify-center mt-3">
        <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple">
          <BIcon name="FileImage" class="w-3 h-3" /> PNG
        </span>
        <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple">
          <BIcon name="Maximize2" class="w-3 h-3" /> 512 × 512 px
        </span>
        <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple">
          <BIcon name="Weight" class="w-3 h-3" /> до 100 КБ
        </span>
        <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-purple/10 border border-brand-purple/20 text-brand-purple">
          <BIcon name="Blend" class="w-3 h-3" /> прозрачный фон
        </span>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept="image/png"
        multiple
        class="hidden"
        @change="onFiles(($event.target as HTMLInputElement).files)" />
    </div>

    <!-- Sticker list -->
    <div v-if="entries.length" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div
        v-for="(e, i) in entries"
        :key="e.id"
        class="relative rounded-2xl border overflow-hidden flex flex-col"
        :class="{
          'border-brand-border bg-white/5':   e.state === 'validating' || e.state === 'uploading',
          'border-brand-success/40 bg-brand-success/5': e.state === 'done',
          'border-brand-error/40 bg-brand-error/5':     e.state === 'error',
        }">

        <!-- Preview -->
        <div class="relative bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjMjIyIi8+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iIzJhMmEyYSIvPjxyZWN0IHg9IjgiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMyYTJhMmEiLz48L3N2Zz4=')] aspect-square flex items-center justify-center">
          <img
            v-if="e.preview"
            :src="e.preview"
            :alt="e.name"
            class="w-full h-full object-contain" />
          <BIcon v-else name="ImageOff" class="w-10 h-10 text-white/20" />

          <!-- State overlay -->
          <div v-if="e.state === 'uploading'" class="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div class="w-6 h-6 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
          </div>

          <!-- Status badge -->
          <div class="absolute top-1.5 left-1.5">
            <span v-if="e.state === 'done'" class="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-brand-success text-white shadow">
              <BIcon name="Check" class="w-2.5 h-2.5" /> ОК
            </span>
            <span v-else-if="e.state === 'error'" class="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-brand-error text-white shadow">
              <BIcon name="X" class="w-2.5 h-2.5" /> Ошибка
            </span>
            <span v-else class="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-black/50 text-white/70">
              {{ e.state === 'uploading' ? 'Загрузка…' : 'Проверка…' }}
            </span>
          </div>

          <!-- Remove -->
          <button
            class="absolute top-1.5 right-1.5 w-5 h-5 bg-black/70 hover:bg-brand-error rounded-full flex items-center justify-center transition-colors"
            @click.stop="removeEntry(e, i)">
            <BIcon name="X" class="w-3 h-3 text-white" />
          </button>
        </div>

        <!-- Error message -->
        <div v-if="e.state === 'error'" class="px-2 py-1.5 text-[11px] text-brand-error font-bold leading-snug">
          {{ e.error }}
        </div>
        <!-- Size / name -->
        <div v-else class="px-2 py-1.5 text-[11px] text-white/40 truncate leading-snug">
          {{ e.name }} · {{ e.sizeKb }} КБ
        </div>
      </div>
    </div>

  </div>
</template>
