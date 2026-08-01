<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { X, Image, Plus } from 'lucide-vue-next'
import api from '@/api'

const props = defineProps<{
  type?: 'posts' | 'avatars' | 'banners'
  folder?: string
  accept?: string
  multiple?: boolean
  maxFiles?: number
  maxSizeMb?: number
}>()

const emit = defineEmits<{ (e: 'uploaded', urls: string[], originalUrls: string[], hasVideo: boolean): void }>()

type PreviewEntry = { id: number; localUrl: string; uploading: boolean; converting: boolean; progress: number; finalUrl?: string; finalOriginalUrl?: string; name: string; size: number; isVideo: boolean }

let nextPreviewId = 0
const previews = ref<PreviewEntry[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const rejectedMsg = ref('')
let rejectedTimer: ReturnType<typeof setTimeout> | null = null

// Native <input accept> only filters the OS file picker — drag/drop and
// clipboard paste bypass it entirely, so re-check every file against the
// same allow-list before it's queued for upload.
const acceptPatterns = () => (props.accept ?? 'image/*,video/*').split(',').map(p => p.trim()).filter(Boolean)

function isFileAccepted(file: File): boolean {
  return acceptPatterns().some(pattern => {
    if (pattern.endsWith('/*')) return file.type.startsWith(pattern.slice(0, -1))
    return file.type === pattern
  })
}

function flashRejected() {
  const patterns = acceptPatterns()
  const imagesOnly = patterns.every(p => p.startsWith('image/'))
  rejectedMsg.value = imagesOnly ? 'Можно загружать только фото и GIF' : 'Этот тип файла здесь не поддерживается'
  if (rejectedTimer) clearTimeout(rejectedTimer)
  rejectedTimer = setTimeout(() => { rejectedMsg.value = '' }, 3000)
}

function flashLimitReached() {
  rejectedMsg.value = `Можно приложить не более ${props.maxFiles} файлов`
  if (rejectedTimer) clearTimeout(rejectedTimer)
  rejectedTimer = setTimeout(() => { rejectedMsg.value = '' }, 3000)
}

function flashMessage(msg: string) {
  rejectedMsg.value = msg
  if (rejectedTimer) clearTimeout(rejectedTimer)
  rejectedTimer = setTimeout(() => { rejectedMsg.value = '' }, 4000)
}

// ── Image compression ──────────────────────────────────────────────────────
const MAX_PX = 1920
const QUALITY = 0.85

function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(file); return }
    const img = new window.Image()
    const src = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(src)
      let { width, height } = img
      if (width <= MAX_PX && height <= MAX_PX) { resolve(file); return }
      if (width > height) { height = Math.round(height * MAX_PX / width); width = MAX_PX }
      else { width = Math.round(width * MAX_PX / height); height = MAX_PX }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const ext = file.type === 'image/png' ? '.png' : '.jpg'
          const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ext), { type: mime }))
        },
        file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        QUALITY,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(src); resolve(file) }
    img.src = src
  })
}

// Re-encodes an oversized image at falling quality/resolution steps until it
// fits under maxBytes, so a photo above the folder's cap (e.g. 10 MB for
// report evidence) gets converted down instead of being rejected outright.
function compressToTarget(file: File, maxBytes: number): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size <= maxBytes) { resolve(file); return }
    const img = new window.Image()
    const src = URL.createObjectURL(file)
    img.onload = async () => {
      URL.revokeObjectURL(src)
      const { width, height } = img
      const QUALITIES = [0.8, 0.65, 0.5, 0.35, 0.2]
      let scale = 1
      let best: Blob | null = null
      for (let attempt = 0; attempt < 12; attempt++) {
        const w = Math.max(1, Math.round(width * scale))
        const h = Math.max(1, Math.round(height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        const quality = QUALITIES[Math.min(attempt, QUALITIES.length - 1)]
        const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
        if (blob && (!best || blob.size < best.size)) best = blob
        if (blob && blob.size <= maxBytes) break
        // Ran through every quality step and it's still too big — shrink dimensions and retry.
        if (attempt >= QUALITIES.length - 1) scale *= 0.75
      }
      if (!best) { resolve(file); return }
      resolve(new File([best], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
    }
    img.onerror = () => { URL.revokeObjectURL(src); resolve(file) }
    img.src = src
  })
}

// ── Upload with id-based reactivity ───────────────────────────────────────
// Entries are tracked by stable `id`, not array position — reordering (or
// removing an earlier item) while another upload is in flight must not make
// that upload write its progress/result into the wrong slot.
// Exposed so parent can call directly
const processFiles = (files: FileList | File[] | null) => {
  if (!files) return
  let rejected = false
  let capped = false
  Array.from(files).forEach((file) => {
    if (props.maxFiles && previews.value.length >= props.maxFiles) { capped = true; return }
    if (!isFileAccepted(file)) { rejected = true; return }
    // Content-based dedup: skip if same name+size is already queued
    if (previews.value.some(p => p.name === file.name && p.size === file.size)) return
    const id = nextPreviewId++
    previews.value.push({ id, localUrl: URL.createObjectURL(file), uploading: true, converting: file.type.startsWith('image/'), progress: 0, name: file.name, size: file.size, isVideo: file.type.startsWith('video/') })
    uploadFile(file, id)
  })
  if (rejected) flashRejected()
  else if (capped) flashLimitReached()
}

const uploadFile = async (file: File, id: number) => {
  const entry = () => previews.value.find(p => p.id === id)
  try {
    let compressed = await compressImage(file)
    const maxBudgetBytes = props.maxSizeMb ? props.maxSizeMb * 1024 * 1024 : null
    if (maxBudgetBytes && compressed.size > maxBudgetBytes) {
      compressed = await compressToTarget(compressed, maxBudgetBytes)
    }
    const e0 = entry()
    if (e0) e0.converting = false
    const formData = new FormData()
    formData.append('file', compressed)

    // Smooth fake progress (Cloudflare buffers the request, real progress events unreliable)
    let fakeTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      const e = entry()
      if (e && e.progress < 90) e.progress = Math.min(90, e.progress + Math.random() * 8 + 2)
    }, 150)

    const res = await api.post(`/media/upload?folder=${props.folder || props.type || 'posts'}`, formData, {
      headers: { 'Content-Type': undefined },
      onUploadProgress: (p) => {
        const e = entry()
        if (e && p.total && p.total > 0) {
          e.progress = Math.min(92, Math.round((p.loaded / p.total) * 95))
        }
      },
    })

    if (fakeTimer) { clearInterval(fakeTimer); fakeTimer = null }
    const e = entry()
    if (!e) return // removed while uploading
    e.progress = 100
    e.finalUrl = res.data.data.url
    e.finalOriginalUrl = res.data.data.originalUrl || res.data.data.url
    setTimeout(() => { const e2 = entry(); if (e2) e2.uploading = false }, 350)
    emitAll()
  } catch (err: any) {
    // Drop the stuck preview instead of leaving a dead thumbnail behind, and
    // actually tell the user something failed — this used to fail silently.
    const idx = previews.value.findIndex(p => p.id === id)
    if (idx !== -1) previews.value.splice(idx, 1)
    const serverMessage = err?.response?.data?.error?.message
    flashMessage(typeof serverMessage === 'string' && serverMessage ? serverMessage : 'Не удалось загрузить файл. Попробуйте ещё раз.')
    console.error('Upload failed:', err?.response?.data ?? err?.message)
  }
}

const emitAll = () => {
  const seen = new Set<string>()
  const urls: string[] = []
  const originalUrls: string[] = []
  let hasVideo = false
  for (const p of previews.value) {
    if (!p.finalUrl || seen.has(p.finalUrl)) continue
    seen.add(p.finalUrl)
    urls.push(p.finalUrl)
    originalUrls.push(p.finalOriginalUrl || p.finalUrl)
    if (p.isVideo) hasVideo = true
  }
  emit('uploaded', urls, originalUrls, hasVideo)
}

const remove = (idx: number) => { previews.value.splice(idx, 1); emitAll() }

const clearAll = () => { previews.value = []; emit('uploaded', [], [], false) }

const REORDER_MIME = 'application/x-bloomly-reorder-index'

const onDrop = (e: DragEvent) => {
  isDragging.value = false
  // A thumbnail being dragged to reorder also carries the browser's synthesized
  // image File in dataTransfer.files — without this guard it re-uploads as a duplicate.
  if (e.dataTransfer?.types.includes(REORDER_MIME)) return
  processFiles(e.dataTransfer?.files ?? null)
}
const onDragOver = (e: DragEvent) => { e.preventDefault(); if (draggedIdx.value === null) isDragging.value = true }
const onDragLeave = (e: DragEvent) => {
  // Only hide if leaving the component entirely (not moving to a child)
  if (!(e.currentTarget as Element)?.contains(e.relatedTarget as Node)) {
    isDragging.value = false
  }
}

// ── Thumbnail reordering (drag to swap places) ──────────────────────────────
const draggedIdx = ref<number | null>(null)
const dragOverIdx = ref<number | null>(null)

function onThumbDragStart(idx: number, e: DragEvent) {
  draggedIdx.value = idx
  e.dataTransfer?.setData(REORDER_MIME, String(idx))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onThumbDragOver(idx: number, e: DragEvent) {
  e.preventDefault()
  if (draggedIdx.value !== null) dragOverIdx.value = idx
}
function onThumbDrop(idx: number, e: DragEvent) {
  e.stopPropagation()
  const from = draggedIdx.value
  dragOverIdx.value = null
  draggedIdx.value = null
  if (from === null || from === idx) return
  const [moved] = previews.value.splice(from, 1)
  previews.value.splice(idx, 0, moved)
  emitAll()
}
function onThumbDragEnd() {
  draggedIdx.value = null
  dragOverIdx.value = null
}

// ── Paste (Ctrl+V) handler ─────────────────────────────────────────────────
const onPaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return
  const files = Array.from(items)
    .filter(i => i.kind === 'file')
    .map(i => i.getAsFile())
    .filter(Boolean) as File[]
  if (files.length) processFiles(files)
}

onMounted(() => document.addEventListener('paste', onPaste))
onUnmounted(() => document.removeEventListener('paste', onPaste))

const hintLabel = () => {
  const maxMB = props.maxSizeMb ?? 100
  const kinds = acceptPatterns().every(p => p.startsWith('image/')) ? 'Фото, GIF' : 'Фото, GIF, видео'
  const limit = props.maxFiles ? `до ${maxMB} МБ, макс. ${props.maxFiles} файлов` : `до ${maxMB} МБ`
  return `${kinds} · ${limit}`
}

// Expose to parent
defineExpose({
  openPicker: () => fileInput.value?.click(),
  processFiles,
  clearAll,
})
</script>

<template>
  <div
    @drop.prevent="onDrop"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
  >
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      @change="(e) => { const el = e.target as HTMLInputElement; const snapshot = Array.from(el.files ?? []); el.value = ''; processFiles(snapshot) }"
      :accept="accept ?? 'image/*,video/*'"
      :multiple="multiple !== false"
    />

    <!-- Drop zone: visible ONLY while dragging -->
    <div
      v-if="isDragging"
      class="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-500/70 bg-violet-500/10 py-8 px-4 select-none transition-all"
    >
      <div class="w-12 h-12 rounded-2xl bg-violet-500/30 flex items-center justify-center">
        <Image class="w-5 h-5 text-violet-300" />
      </div>
      <p class="text-sm font-bold text-violet-300">Отпусти для загрузки</p>
      <p class="text-xs text-white/30">{{ hintLabel() }}</p>
    </div>

    <!-- Empty state — click to pick files -->
    <button
      v-else-if="!previews.length"
      type="button"
      @click="fileInput?.click()"
      class="w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 hover:border-violet-500/50 hover:bg-violet-500/8 py-6 px-4 transition-all group/empty"
    >
      <div class="w-10 h-10 rounded-2xl bg-white/8 group-hover/empty:bg-violet-500/20 flex items-center justify-center transition-colors">
        <Image class="w-4 h-4 text-white/35 group-hover/empty:text-violet-400 transition-colors" />
      </div>
      <p class="text-xs font-bold text-white/35 group-hover/empty:text-violet-400 transition-colors">Нажми или перетащи файл</p>
      <p class="text-[10px] text-white/20">{{ hintLabel() }}</p>
    </button>

    <!-- Thumbnails grid (shown when files exist and not dragging) -->
    <div v-else-if="previews.length">
      <div class="grid grid-cols-4 gap-2">
        <div
          v-for="(p, idx) in previews"
          :key="p.id"
          draggable="true"
          @dragstart="onThumbDragStart(idx, $event)"
          @dragover="onThumbDragOver(idx, $event)"
          @dragleave="dragOverIdx === idx && (dragOverIdx = null)"
          @drop.prevent="onThumbDrop(idx, $event)"
          @dragend="onThumbDragEnd"
          class="relative aspect-square rounded-xl overflow-hidden bg-white/5 border-2 group/thumb cursor-grab active:cursor-grabbing transition-all"
          :class="dragOverIdx === idx && draggedIdx !== idx ? 'border-violet-500/70 scale-95' : 'border-white/10'"
          :style="draggedIdx === idx ? 'opacity: 0.4' : ''"
        >
          <video v-if="p.isVideo" :src="p.localUrl" muted playsinline class="w-full h-full object-cover transition-opacity duration-300" :class="p.uploading ? 'opacity-30' : 'opacity-100'" />
          <img v-else :src="p.localUrl" class="w-full h-full object-cover transition-opacity duration-300" :class="p.uploading ? 'opacity-30' : 'opacity-100'" />
          <div v-if="p.isVideo" class="absolute bottom-1 right-1 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center pointer-events-none">
            <svg viewBox="0 0 24 24" class="w-2.5 h-2.5 text-white" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>

          <!-- Converting (client-side compression before upload starts) -->
          <div v-if="p.converting" class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 backdrop-blur-[2px]">
            <div class="w-9 h-9 rounded-full bg-brand-accent flex items-center justify-center shadow-md animate-spin">
              <svg viewBox="0 0 15 15" fill="currentColor" class="w-4 h-4 text-white">
                <path d="M5 0C3.89543 0 3 0.895431 3 2V3C3 4.10457 3.89543 5 5 5C6.10457 5 7 4.10457 7 3V2C7 0.895431 6.10457 0 5 0Z"/>
                <path d="M10 0C8.89543 0 8 0.895431 8 2V3C8 4.10457 8.89543 5 10 5C11.1046 5 12 4.10457 12 3V2C12 0.895431 11.1046 0 10 0Z"/>
                <path d="M2 5C0.895431 5 0 5.89543 0 7V7.5C0 8.60457 0.895431 9.5 2 9.5C3.10457 9.5 4 8.60457 4 7.5V7C4 5.89543 3.10457 5 2 5Z"/>
                <path d="M13 5C11.8954 5 11 5.89543 11 7V7.5C11 8.60457 11.8954 9.5 13 9.5C14.1046 9.5 15 8.60457 15 7.5V7C15 5.89543 14.1046 5 13 5Z"/>
                <path d="M9.61273 7.77893C8.51793 6.44953 6.48207 6.44953 5.38727 7.77893L2.46943 11.322C1.2614 12.7889 2.30486 15 4.20516 15C4.47668 15 4.74447 14.9368 4.98732 14.8154L5.34699 14.6355C6.70234 13.9578 8.29766 13.9578 9.65301 14.6355L10.0127 14.8154C10.2555 14.9368 10.5233 15 10.7948 15C12.6951 15 13.7386 12.7889 12.5306 11.322L9.61273 7.77893Z"/>
              </svg>
            </div>
            <span class="text-[9px] text-white/80 font-bold">Обработка…</span>
          </div>

          <!-- Upload progress -->
          <div v-else-if="p.uploading" class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 backdrop-blur-[2px]">
            <svg viewBox="0 0 48 48" class="w-10 h-10 drop-shadow">
              <defs>
                <clipPath :id="`pf-${idx}`">
                  <rect x="0" :y="48 - (p.progress / 100) * 48" width="48" :height="(p.progress / 100) * 48" />
                </clipPath>
              </defs>
              <g opacity="0.2" fill="white">
                <ellipse cx="24" cy="32" rx="11" ry="9"/>
                <ellipse cx="11" cy="21" rx="5.5" ry="5"/>
                <ellipse cx="37" cy="21" rx="5.5" ry="5"/>
                <ellipse cx="16.5" cy="13.5" rx="5" ry="4.5"/>
                <ellipse cx="31.5" cy="13.5" rx="5" ry="4.5"/>
              </g>
              <g :clip-path="`url(#pf-${idx})`" fill="#818cf8">
                <ellipse cx="24" cy="32" rx="11" ry="9"/>
                <ellipse cx="11" cy="21" rx="5.5" ry="5"/>
                <ellipse cx="37" cy="21" rx="5.5" ry="5"/>
                <ellipse cx="16.5" cy="13.5" rx="5" ry="4.5"/>
                <ellipse cx="31.5" cy="13.5" rx="5" ry="4.5"/>
              </g>
            </svg>
            <span class="text-[9px] text-white/80 font-bold tabular-nums">{{ Math.round(p.progress) }}%</span>
          </div>

          <!-- Done checkmark -->
          <div v-else class="absolute top-1.5 left-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-md opacity-0 group-hover/thumb:opacity-100 transition-opacity">
            <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
            </svg>
          </div>

          <button
            @click.stop="remove(idx)"
            class="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-rose-500 shadow-md"
          >
            <X class="w-3 h-3 text-white" />
          </button>
        </div>

        <!-- Add more tile -->
        <button
          v-if="!maxFiles || previews.length < maxFiles"
          @click="fileInput?.click()"
          @dragover="onThumbDragOver(previews.length, $event)"
          @drop.prevent="onThumbDrop(previews.length, $event)"
          class="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all group/add"
          :class="dragOverIdx === previews.length ? 'border-violet-500/70 bg-violet-500/8' : 'border-white/15 hover:border-violet-500/50 hover:bg-violet-500/8'"
        >
          <Plus class="w-5 h-5 text-white/30 group-hover/add:text-violet-400 transition-colors" />
          <span class="text-[9px] font-bold text-white/25 group-hover/add:text-violet-400 transition-colors">Ещё</span>
        </button>
      </div>
    </div>
    <p v-if="rejectedMsg" class="mt-1.5 text-[11px] font-semibold text-rose-400">{{ rejectedMsg }}</p>
  </div>
</template>

<style scoped>
.thumb-list-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.thumb-list-leave-active { transition: all 0.2s ease; }
.thumb-list-enter-from { opacity: 0; transform: translateY(8px); }
.thumb-list-leave-to   { opacity: 0; transform: translateY(-4px); }
</style>