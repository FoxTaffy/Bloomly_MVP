import { apiErrorMessage } from '@/lib/apiError'
import { onUnmounted, reactive, ref, type Ref } from 'vue'
import { uploadMedia } from '@/lib/uploadMedia'
import { useLangStore } from '@/stores/lang'
import { useUploadPrecheck } from '@/composables/useUploadPrecheck'
import { effectiveMime } from '@/lib/uploadLimits'

// Multiple attachments can be queued at once (e.g. a photo + a video sent together)
export interface PendingAttachment {
  id: number
  kind: 'image' | 'video' | 'gif' | 'audio' | 'file'
  name: string
  size: number
  previewUrl: string | null
  uploadedUrl: string | null
  uploading: boolean
  progress: number
  failed: boolean
}

export const MAX_ATTACHMENTS = 10

function fileKind(file: File): 'image' | 'video' | 'audio' | 'file' {
  const type = effectiveMime(file) // PSD и архивы браузер часто отдаёт без типа — определяем по расширению
  if (type === 'image/vnd.adobe.photoshop') return 'file'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'file'
}

const revokePreview = (a: PendingAttachment) => {
  if (a.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
}

/** Composer attachment queue: each file uploads on its own as soon as it is added. */
export function useChatAttachments(fileInputEl: Ref<HTMLInputElement | null>) {
  const langStore = useLangStore()
  const { precheck, fromServerError } = useUploadPrecheck()
  const pendingAttachments = ref<PendingAttachment[]>([])
  const uploadError = ref<string | null>(null)
  let uploadErrorTimer: ReturnType<typeof setTimeout> | null = null
  let attachSeq = 0

  function showUploadError(message: string) {
    uploadError.value = message
    if (uploadErrorTimer) clearTimeout(uploadErrorTimer)
    uploadErrorTimer = setTimeout(() => { uploadError.value = null }, 6000)
  }

  function addPendingFile(file: File) {
    if (pendingAttachments.value.length >= MAX_ATTACHMENTS) return
    // Файл больше лимита тарифа (или такого типа на тарифе нет) — объясняем сразу, не отправляя гигабайты зря
    const tooBig = precheck(file)
    if (tooBig) { showUploadError(tooBig); return }
    const kind = fileKind(file)
    // Must be reactive() *before* pushing — mutating a plain object kept only via this
    // outer `item` reference bypasses Vue's reactive array proxy entirely, so progress/
    // uploading/uploadedUrl updates would never trigger a re-render (stuck at 0% forever).
    const item = reactive<PendingAttachment>({
      id: ++attachSeq,
      kind,
      name: file.name,
      size: file.size,
      previewUrl: (kind === 'image' || kind === 'video') ? URL.createObjectURL(file) : null,
      uploadedUrl: null,
      uploading: true,
      progress: 0,
      failed: false,
    })
    pendingAttachments.value.push(item)

    ;(async () => {
      try {
        // Файлы крупнее 50 МБ уходят частями, остальные — одним запросом (lib/uploadMedia.ts); тип PSD/архивов — по расширению
        const res = await uploadMedia(file, {
          folder: 'messages',
          onProgress: (f) => { item.progress = Math.round(f * 100) },
        })
        const url = res.url ?? null
        if (!url) throw new Error('no url')
        // A video with no audio track behaves like a GIF — render it with the lightweight
        // autoplay/pause UI instead of the full player (seek bar, volume, speed, etc).
        if (item.kind === 'video' && res.isSilentVideo) item.kind = 'gif'
        item.uploadedUrl = url
        item.progress = 100
      } catch (err) {
        item.failed = true
        showUploadError(fromServerError(err) ?? apiErrorMessage(err) ?? langStore.t.chatFileUploadFailedError)
        setTimeout(() => removePendingAttachment(item.id), 1500)
      } finally {
        item.uploading = false
      }
    })()
  }

  function addFiles(files: File[]) {
    const room = MAX_ATTACHMENTS - pendingAttachments.value.length
    for (const file of files.slice(0, Math.max(0, room))) addPendingFile(file)
  }

  function removePendingAttachment(id: number) {
    const idx = pendingAttachments.value.findIndex((a) => a.id === id)
    if (idx === -1) return
    const [removed] = pendingAttachments.value.splice(idx, 1)
    revokePreview(removed)
  }

  function clearAttachments() {
    pendingAttachments.value.forEach(revokePreview)
    pendingAttachments.value = []
    if (fileInputEl.value) fileInputEl.value.value = ''
  }

  function onFileChange(e: Event) {
    const files = (e.target as HTMLInputElement).files
    if (!files?.length) return
    addFiles(Array.from(files))
    if (fileInputEl.value) fileInputEl.value.value = ''
  }

  /** Ctrl+V an image/file straight into the composer, same upload path as the attach button. */
  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (!files.length) return // no file on the clipboard — fall through to the browser's normal text paste
    e.preventDefault()
    addFiles(files)
  }

  onUnmounted(() => {
    if (uploadErrorTimer) clearTimeout(uploadErrorTimer)
    pendingAttachments.value.forEach(revokePreview)
  })

  return { pendingAttachments, uploadError, removePendingAttachment, clearAttachments, onFileChange, onPaste }
}
