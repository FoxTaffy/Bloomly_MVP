<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { fileExt } from '@/lib/postMedia'
import { useLangStore } from '@/stores/lang'

// Плашки скачивания вложений поста (PSD, архивы). Пока пост закрыт (платный, для подписчиков, NSFW) — ссылка неактивна;
// настоящий доступ к файлу всё равно проверяет сервер при отдаче.
const props = defineProps<{ urls: string[]; locked?: boolean }>()
const langStore = useLangStore()
const items = computed(() => props.urls.map(url => ({ url, ext: fileExt(url) })))
</script>

<template>
  <div v-if="items.length" class="mt-3 flex flex-col gap-2" data-post-interactive @click.stop>
    <component
      v-for="f in items" :key="f.url"
      :is="locked ? 'div' : 'a'"
      :href="locked ? undefined : f.url"
      :download="locked ? undefined : ''"
      rel="noopener noreferrer"
      class="flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors"
      :class="locked ? 'border-white/10 bg-white/3 opacity-60 cursor-not-allowed' : 'border-brand-accent/30 bg-brand-accent/8 hover:bg-brand-accent/15'"
    >
      <span class="w-10 h-10 rounded-xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center shrink-0">
        <BIcon :name="locked ? 'Lock' : 'FileText'" class="w-5 h-5 text-brand-accent" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-bold text-white truncate">{{ langStore.t.postFileLabel }} · {{ f.ext }}</span>
        <span class="block text-[11px] text-white/45">{{ locked ? langStore.t.postFileLocked : langStore.t.postFileDownload }}</span>
      </span>
      <BIcon v-if="!locked" name="Download" class="w-4 h-4 text-white/60 shrink-0" />
    </component>
  </div>
</template>
