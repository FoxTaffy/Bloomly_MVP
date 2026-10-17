<script setup lang="ts">
import { ref, watch } from 'vue'
import BIcon from './BIcon.vue'
import { fetchReportEvidence, fetchSupportAttachment, fetchVerificationEvidence } from '../composables/useReportEvidence'

// Картинка или видео с заглушкой вместо пустого места, если файл недоступен
// (удалён, нет прав, хранилище не ответило).
const props = withDefaults(defineProps<{
  src?: string | null
  kind?: 'image' | 'video'
  /** public — прямая ссылка; report-evidence — закрытое фото жалобы через API модераторов. */
  source?: 'public' | 'report-evidence' | 'support-attachment' | 'verification-evidence'
  label?: string
}>(), { kind: 'image', source: 'public', label: 'Файл недоступен' })

const resolved = ref<string | null>(null)
const failed = ref(false)

watch(() => [props.src, props.source], async () => {
  failed.value = false
  resolved.value = null
  if (!props.src) { failed.value = true; return }
  if (props.source === 'public') { resolved.value = props.src; return }
  const requested = props.src
  try {
    const loader = props.source === 'support-attachment' ? fetchSupportAttachment
      : props.source === 'verification-evidence' ? fetchVerificationEvidence
      : fetchReportEvidence
    const blobUrl = await loader(requested)
    if (props.src === requested) resolved.value = blobUrl
  } catch {
    if (props.src === requested) failed.value = true
  }
}, { immediate: true })
</script>

<template>
  <div v-if="failed" role="img" :aria-label="label" :title="label"
    class="flex items-center justify-center min-h-12 min-w-12 bg-white/4 text-white/35 overflow-hidden">
    <BIcon name="ImageOff" class="w-5 h-5 shrink-0" />
  </div>
  <video v-else-if="kind === 'video' && resolved" :src="resolved" controls playsinline @error="failed = true" />
  <img v-else-if="resolved" :src="resolved" alt="" @error="failed = true" />
  <div v-else class="min-h-12 min-w-12 bg-white/4 animate-pulse" />
</template>
