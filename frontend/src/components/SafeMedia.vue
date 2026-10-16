<script setup lang="ts">
import { ref, watch } from 'vue'
import BIcon from './BIcon.vue'
import { fetchReportEvidence, fetchSupportAttachment } from '../composables/useReportEvidence'

// Картинка или видео с заглушкой вместо пустого места, если файл недоступен
// (удалён, нет прав, хранилище не ответило).
const props = withDefaults(defineProps<{
  src?: string | null
  kind?: 'image' | 'video'
  /** public — прямая ссылка; report-evidence — закрытое фото жалобы через API модераторов. */
  source?: 'public' | 'report-evidence' | 'support-attachment'
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
    const blobUrl = await (props.source === 'support-attachment' ? fetchSupportAttachment(requested) : fetchReportEvidence(requested))
    if (props.src === requested) resolved.value = blobUrl
  } catch {
    if (props.src === requested) failed.value = true
  }
}, { immediate: true })
</script>

<template>
  <div v-if="failed" role="img" :aria-label="label" :title="label"
    class="flex items-center justify-center min-h-[3rem] min-w-[3rem] bg-white/[0.04] text-white/35 overflow-hidden">
    <BIcon name="ImageOff" class="w-5 h-5 flex-shrink-0" />
  </div>
  <video v-else-if="kind === 'video' && resolved" :src="resolved" controls playsinline @error="failed = true" />
  <img v-else-if="resolved" :src="resolved" alt="" @error="failed = true" />
  <div v-else class="min-h-[3rem] min-w-[3rem] bg-white/[0.04] animate-pulse" />
</template>
