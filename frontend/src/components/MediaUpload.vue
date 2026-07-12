<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { X, Image, Plus } from 'lucide-vue-next'
import api from '@/api'

const props = defineProps<{
  type?: 'posts' | 'avatars' | 'banners'
  folder?: string
  accept?: string
  multiple?: boolean
}>()

const emit = defineEmits<{ (e: 'uploaded', urls: string[], originalUrls: string[]): void }>()

type PreviewEntry = { localUrl: string; uploading: boolean; progress: number; finalUrl?: string; finalOriginalUrl?: string; name: string; size: number; isVideo: boolean }

const previews = ref<PreviewEntry[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

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

// ── Upload with index-based reactivity ────────────────────────────────────
// Exposed so parent can call directly
const processFiles = (files: FileList | File[] | null) => {
  if (!files) return
  Array.from(files).forEach((file) => {
    // Content-based dedup: skip if same name+size is already queued
    if (previews.value.some(p => p.name === file.name && p.size === file.size)) return
    const idx = previews.value.length
    previews.value.push({ localUrl: URL.createObjectURL(file), uploading: true, progress: 0, name: file.name, size: file.size, isVideo: file.type.startsWith('video/') })
    uploadFile(file, idx)
  })
}

const uploadFile = async (file: File, idx: number) => {
  try {
    const compressed = await compressImage(file)
    const formData = new FormData()
    formData.append('file', compressed)

    // Smooth fake progress (Cloudflare buffers the request, real progress events unreliable)
    let fakeTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (previews.value[idx] && previews.value[idx].progress < 90) {
        previews.value[idx].progress = Math.min(90, previews.value[idx].progress + Math.random() * 8 + 2)
      }
    }, 150)

    const res = await api.post(`/media/upload?folder=${props.folder || props.type || 'posts'}`, formData, {
      headers: { 'Content-Type': undefined },
      onUploadProgress: (p) => {
        if (p.total && p.total > 0) {
          previews.value[idx].progress = Math.min(92, Math.round((p.loaded / p.total) * 95))
        }
      },
    })

    if (fakeTimer) { clearInterval(fakeTimer); fakeTimer = null }
    previews.value[idx].progress = 100
    previews.value[idx].finalUrl = res.data.data.url
    previews.value[idx].finalOriginalUrl = res.data.data.originalUrl || res.data.data.url
    setTimeout(() => { previews.value[idx].uploading = false }, 350)
    emitAll()
  } catch (err: any) {
    previews.value[idx].uploading = false
    previews.value[idx].progress = 0
    console.error('Upload failed:', err?.response?.data ?? err?.message)
  }
}

const emitAll = () => {
  const seen = new Set<string>()
  const urls: string[] = []
  const originalUrls: string[] = []
  for (const p of previews.value) {
    if (!p.finalUrl || seen.has(p.finalUrl)) continue
    seen.add(p.finalUrl)
    urls.push(p.finalUrl)
    originalUrls.push(p.finalOriginalUrl || p.finalUrl)
  }
  emit('uploaded', urls, originalUrls)
}

const remove = (idx: number) => { previews.value.splice(idx, 1); emitAll() }

const clearAll = () => { previews.value = []; emit('uploaded', [], []) }

const onDrop = (e: DragEvent) => { isDragging.value = false; processFiles(e.dataTransfer?.files ?? null) }
const onDragOver = (e: DragEvent) => { e.preventDefault(); isDragging.value = true }
const onDragLeave = (e: DragEvent) => {
  // Only hide if leaving the component entirely (not moving to a child)
  if (!(e.currentTarget as Element)?.contains(e.relatedTarget as Node)) {
    isDragging.value = false
  }
}

// ── Paste (Ctrl+V) handler ─────────────────────────────────────────────────
const onPaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return
  const mediaFiles = Array.from(items)
    .filter(i => i.kind === 'file' && (i.type.startsWith('image/') || i.type.startsWith('video/')))
    .map(i => i.getAsFile())
    .filter(Boolean) as File[]
  if (mediaFiles.length) processFiles(mediaFiles)
}

onMounted(() => document.addEventListener('paste', onPaste))
onUnmounted(() => document.removeEventListener('paste', onPaste))

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
      :accept="accept ?? 'image/*,video/*,audio/*'"
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
      <p class="text-xs text-white/30">Фото, GIF, видео · до 100 МБ</p>
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
      <p class="text-[10px] text-white/20">Фото, GIF, видео · до 100 МБ</p>
    </button>

    <!-- Thumbnails grid (shown when files exist and not dragging) -->
    <div v-else-if="previews.length">
      <div class="grid grid-cols-4 gap-2">
        <div
          v-for="(p, idx) in previews"
          :key="idx"
          class="relative aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 group/thumb"
        >
          <video v-if="p.isVideo" :src="p.localUrl" muted playsinline class="w-full h-full object-cover transition-opacity duration-300" :class="p.uploading ? 'opacity-30' : 'opacity-100'" />
          <img v-else :src="p.localUrl" class="w-full h-full object-cover transition-opacity duration-300" :class="p.uploading ? 'opacity-30' : 'opacity-100'" />
          <div v-if="p.isVideo" class="absolute bottom-1 right-1 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center pointer-events-none">
            <svg viewBox="0 0 24 24" class="w-2.5 h-2.5 text-white" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>

          <!-- Upload progress -->
          <div v-if="p.uploading" class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 backdrop-blur-[2px]">
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
          @click="fileInput?.click()"
          class="aspect-square rounded-xl border-2 border-dashed border-white/15 hover:border-violet-500/50 hover:bg-violet-500/8 flex flex-col items-center justify-center gap-1 transition-all group/add"
        >
          <Plus class="w-5 h-5 text-white/30 group-hover/add:text-violet-400 transition-colors" />
          <span class="text-[9px] font-bold text-white/25 group-hover/add:text-violet-400 transition-colors">Ещё</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thumb-list-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.thumb-list-leave-active { transition: all 0.2s ease; }
.thumb-list-enter-from { opacity: 0; transform: translateY(8px); }
.thumb-list-leave-to   { opacity: 0; transform: translateY(-4px); }
</style>