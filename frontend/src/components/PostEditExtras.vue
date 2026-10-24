<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import { useLangStore } from '@/stores/lang'
import { sanitizeTagInput } from '@/lib/tagRules'

// Дополнительные поля редактирования поста: теги, NSFW, метка ИИ и добавление медиа.
// Состоянием владеет родитель — компонент только меняет его через события.
const props = defineProps<{
  tags: string[]
  isNsfw: boolean
  isAiGenerated: boolean
  /** Сколько файлов уже в посте — остаток до лимита идёт на новые. */
  existingMediaCount: number
}>()

const emit = defineEmits<{
  (e: 'update:tags', v: string[]): void
  (e: 'update:isNsfw', v: boolean): void
  (e: 'update:isAiGenerated', v: boolean): void
  (e: 'media', urls: string[], originalUrls: string[]): void
}>()

const MAX_MEDIA = 20
const langStore = useLangStore()
const tagInput = ref('')

function addTag() {
  const tag = sanitizeTagInput(tagInput.value.replace(/^\s*#+/, ''))
  tagInput.value = ''
  if (tag && !props.tags.includes(tag)) emit('update:tags', [...props.tags, tag])
}

function removeTag(tag: string) {
  emit('update:tags', props.tags.filter((t) => t !== tag))
}
</script>

<template>
  <div class="mt-3 space-y-3">
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        v-for="tag in tags" :key="tag"
        class="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-accent/10 border border-brand-accent/20 rounded-md text-[11px] font-semibold text-brand-accent">
        #{{ tag }}
        <button type="button" @click="removeTag(tag)" class="hover:text-white" aria-label="Убрать тег"><X class="w-3 h-3" /></button>
      </span>
      <input
        v-model="tagInput"
        @keydown.enter.prevent="addTag"
        @keydown.space.prevent="addTag"
        @keydown.comma.prevent="addTag"
        @blur="addTag"
        placeholder="Добавить тег"
        maxlength="50"
        class="min-w-[8rem] flex-1 bg-transparent text-xs text-white placeholder-white/35 outline-hidden px-1 py-1" />
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        @click="emit('update:isNsfw', !isNsfw)"
        class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
        :class="isNsfw
          ? 'border-brand-error/60 text-brand-error bg-brand-error/10'
          : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
        NSFW
      </button>
      <button
        type="button"
        @click="emit('update:isAiGenerated', !isAiGenerated)"
        :title="langStore.t.aiGenToggleTitle"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
        :class="isAiGenerated
          ? 'border-brand-purple/60 text-brand-purple bg-brand-purple/10'
          : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
        <BIcon name="Bot" class="w-3.5 h-3.5" /> {{ langStore.t.aiGenBadge }}
      </button>
    </div>

    <MediaUpload
      v-if="existingMediaCount < MAX_MEDIA"
      type="posts"
      :multiple="true"
      :max-files="MAX_MEDIA - existingMediaCount"
      @uploaded="(urls, originals) => emit('media', urls, originals)" />
  </div>
</template>
