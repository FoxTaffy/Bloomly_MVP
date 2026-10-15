import { onUnmounted, ref } from 'vue'
import api from '@/api'

/** Records a voice message with MediaRecorder, uploads it and hands the URL to `onUploaded`. */
export function useVoiceRecorder(onUploaded: (url: string) => void) {
  const isRecording = ref(false)
  const recordingSeconds = ref(0)
  const voiceUploading = ref(false)
  let mediaRecorder: MediaRecorder | null = null
  let recordTimer: ReturnType<typeof setInterval> | null = null

  async function startRecording() {
    if (isRecording.value) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorder = mr
      isRecording.value = true
      recordingSeconds.value = 0
      recordTimer = setInterval(() => { recordingSeconds.value++ }, 1000)
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (recordTimer) { clearInterval(recordTimer); recordTimer = null }
        isRecording.value = false
        const blob = new Blob(chunks, { type: mimeType })
        if (blob.size < 500) return
        voiceUploading.value = true
        try {
          const ext = mimeType.includes('webm') ? 'webm' : 'ogg'
          const form = new FormData()
          form.append('file', new File([blob], `voice.${ext}`, { type: mimeType }))
          const res = await api.post('/media/upload?folder=messages', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          const url = res.data?.data?.url ?? null
          if (url) onUploaded(url)
        } catch {}
        finally { voiceUploading.value = false }
      }
      mr.start(100)
    } catch {
      isRecording.value = false
    }
  }

  function stopRecording() {
    mediaRecorder?.stop()
    mediaRecorder = null
  }

  const fmtRecording = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  onUnmounted(() => {
    if (recordTimer) clearInterval(recordTimer)
    mediaRecorder?.stop()
  })

  return { isRecording, recordingSeconds, voiceUploading, startRecording, stopRecording, fmtRecording }
}
