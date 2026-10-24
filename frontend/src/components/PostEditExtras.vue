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
    <!-- Теги — как в форме создания поста: таблетки (нажатие убирает тег) и поле «тег + Enter».
         Пробел внутри тега допустим и станет «_», как при создании. -->
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="tag in tags" :key="tag"
        type="button"
        @click="removeTag(tag)"
        :aria-label="`Убрать тег ${tag}`"
        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-xs font-semibold hover:bg-brand-accent/25 transition-colors">
        #{{ tag }}
        <X class="w-3 h-3 text-brand-accent/60" aria-hidden="true" />
      </button>
      <div class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-transparent hover:border-brand-border hover:bg-brand-bg focus-within:border-brand-border transition-all">
        <BIcon name="Hash" class="w-4 h-4 text-white/55 shrink-0" aria-hidden="true" />
        <input
          v-model="tagInput"
          @keydown.enter.prevent="addTag"
          @keydown.comma.prevent="addTag"
          @blur="addTag"
          placeholder="тег + Enter"
          aria-label="Добавить тег"
          maxlength="50"
          class="w-28 bg-transparent text-xs text-white placeholder-brand-muted outline-hidden" />
      </div>
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
