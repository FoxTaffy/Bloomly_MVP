<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import api from '@/api'

const props = defineProps<{
  type?: 'posts' | 'avatars' | 'banners'
  multiple?: boolean
}>()

const emit = defineEmits<{ (e: 'uploaded', urls: string[]): void }>()

type PreviewEntry = { localUrl: string; uploading: boolean; progress: number; finalUrl?: string; name: string; size: number }

const previews = ref<PreviewEntry[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

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
    previews.value.push({ localUrl: URL.createObjectURL(file), uploading: true, progress: 0, name: file.name, size: file.size })
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

    const res = await api.post(`/media/upload?folder=${props.type || 'posts'}`, formData, {
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
    setTimeout(() => { previews.value[idx].uploading = false }, 350)
    emitAll()
  } catch (err: any) {
    previews.value[idx].uploading = false
    previews.value[idx].progress = 0
    console.error('Upload failed:', err?.response?.data ?? err?.message)
  }
}

const emitAll = () => emit('uploaded', [...new Set(previews.value.filter(p => p.finalUrl).map(p => p.finalUrl!))])

const remove = (idx: number) => { previews.value.splice(idx, 1); emitAll() }

const clearAll = () => { previews.value = []; emit('uploaded', []) }

const onDrop = (e: DragEvent) => { processFiles(e.dataTransfer?.files ?? null) }

// Expose to parent
defineExpose({
  openPicker: () => fileInput.value?.click(),
  processFiles,
  clearAll,
})
</script>

<template>
  <div>
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      @change="(e) => { const el = e.target as HTMLInputElement; const snapshot = Array.from(el.files ?? []); el.value = ''; processFiles(snapshot) }"
      accept="image/*,video/*,audio/*"
      :multiple="multiple !== false"
    />

    <!-- Thumbnail previews -->
    <Transition name="thumb-list">
      <div v-if="previews.length" class="grid grid-cols-4 gap-2 mt-3">
        <div
          v-for="(p, idx) in previews"
          :key="idx"
          class="relative aspect-square rounded-xl overflow-hidden bg-brand-bg border border-brand-border group/thumb"
        >
          <img :src="p.localUrl" class="w-full h-full object-cover transition-opacity duration-300" :class="p.uploading ? 'opacity-30' : 'opacity-100'" />

          <!-- Upload progress -->
          <div v-if="p.uploading" class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 backdrop-blur-[2px]">
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
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.thumb-list-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.thumb-list-leave-active { transition: all 0.2s ease; }
.thumb-list-enter-from { opacity: 0; transform: translateY(8px); }
.thumb-list-leave-to   { opacity: 0; transform: translateY(-4px); }
</style>