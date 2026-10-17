<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="props.open"
        class="reference-backdrop"
        @click.self="close"
      >
        <div
          class="reference-modal"
          @contextmenu.prevent
        >
          <!-- Header -->
          <div class="modal-header">
            <span class="modal-title">
              Reference Sheet
              <span v-if="props.username" class="text-zinc-400">· @{{ props.username }}</span>
            </span>
            <div class="header-actions">
              <span class="wm-badge">🔒 Bloomly Protected</span>
              <button type="button" class="close-btn" @click="close" aria-label="Close">✕</button>
            </div>
          </div>

          <!-- Image area -->
          <div class="image-wrap" ref="imageWrapRef">
            <div v-if="loading" class="img-placeholder">
              <span class="animate-spin text-3xl">⟳</span>
            </div>
            <div v-else-if="error" class="img-placeholder text-red-400">
              {{ error }}
            </div>
            <template v-else>
              <!-- Watermarked image served from backend, displayed as blob URL -->
              <img
                :src="blobUrl ?? undefined"
                alt="Reference sheet"
                class="reference-img"
                draggable="false"
                @load="onImageLoad"
              />
              <!-- Overlay branding layer (visual hint, not a security wall) -->
              <div class="overlay-watermark" aria-hidden="true">
                bloomly.fun
              </div>
            </template>
          </div>

          <!-- Footer hint -->
          <div class="modal-footer">
            <span class="text-xs text-zinc-600">
              This image is protected by Bloomly's watermarking system.
              Saving or redistributing without permission violates our
              <a href="/terms" class="underline hover:text-zinc-400" target="_blank" rel="noopener">Terms of Service</a>.
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, watch, onBeforeUnmount } from 'vue'
import api from '@/api'

const props = defineProps<{
  /** Whether the modal is visible */
  open: boolean
  /** User ID whose reference to load */
  userId: string
  /** Optional @username displayed in the header */
  username?: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const loading      = ref(false)
const error        = ref<string | null>(null)
const blobUrl      = ref<string | null>(null)
const imageWrapRef = ref<HTMLElement | null>(null)

// Revoke the previous blob URL to avoid memory leaks
function revokePrev() {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = null
  }
}

async function loadReference() {
  revokePrev()
  loading.value = true
  error.value   = null
  try {
    // The endpoint returns raw JPEG bytes with Cache-Control: private, no-store
    // We request it as arraybuffer so we never expose the URL in an <img src>.
    const res = await api.get<ArrayBuffer>(`/users/${props.userId}/fursona/reference`, {
      responseType: 'arraybuffer',
    })
    const blob = new Blob([res.data], { type: 'image/jpeg' })
    blobUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Could not load reference image'
  } finally {
    loading.value = false
  }
}

function onImageLoad() {
  // Force CSS user-select:none & pointer-events:none on the rendered image
  const img = imageWrapRef.value?.querySelector('img')
  if (img) {
    img.style.userSelect = 'none'
    img.style.pointerEvents = 'none'
  }
}

function close() {
  emit('close')
}

// Load reference image whenever the modal opens
watch(() => props.open, (val) => {
  if (val) {
    loadReference()
    // Prevent background scroll
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
    revokePrev()
  }
})

onBeforeUnmount(() => {
  revokePrev()
  document.body.style.overflow = ''
})
</script>

<style scoped>
@reference "../../assets/style.css";
/* Backdrop */
.reference-backdrop {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm;
}

/* Modal container */
.reference-modal {
  @apply relative flex flex-col bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl
         max-w-3xl w-full mx-4 overflow-hidden;
  max-height: 90dvh;
}

/* Header */
.modal-header {
  @apply flex items-center justify-between px-4 py-3 border-b border-zinc-800;
}
.modal-title { @apply text-white font-medium text-sm; }
.header-actions { @apply flex items-center gap-3; }
.wm-badge {
  @apply text-xs text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded-full px-2 py-0.5;
}
.close-btn {
  @apply w-7 h-7 flex items-center justify-center rounded-full text-zinc-400
         hover:bg-zinc-700 hover:text-white transition-colors text-sm;
}

/* Image area */
.image-wrap {
  @apply relative flex-1 overflow-auto flex items-center justify-center bg-zinc-950 min-h-48;
  /* Prevent text selection on the image */
  user-select: none;
  -webkit-user-select: none;
}
.img-placeholder {
  @apply flex items-center justify-center h-64 text-zinc-500;
}
.reference-img {
  @apply max-w-full max-h-[70dvh] object-contain;
  /* Belt-and-suspenders drag prevention */
  -webkit-user-drag: none;
  user-select: none;
  pointer-events: none;
}

/* Overlay branding */
.overlay-watermark {
  @apply absolute bottom-3 right-3 text-white/25 text-sm font-bold tracking-widest
         pointer-events-none select-none;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
}

/* Footer */
.modal-footer {
  @apply px-4 py-2 border-t border-zinc-800;
}

/* Transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
