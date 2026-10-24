<script setup lang="ts">
import { computed, ref } from 'vue'
import MentionDropdown from './MentionDropdown.vue'
import { useMentionInput } from '@/composables/useMentionInput'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  minHeight?: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const textarea = ref<HTMLTextAreaElement | null>(null)
const text = computed({ get: () => props.modelValue, set: (value: string) => emit('update:modelValue', value) })
// Подсказки @упоминаний: друзья — первыми, «@» без букв сразу показывает друзей
const mention = useMentionInput(text, textarea)

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
  mention.onInput()
}
</script>

<template>
  <div class="relative">
    <textarea
      ref="textarea"
      :value="modelValue"
      :placeholder="placeholder"
      autofocus
      @input="onInput"
      @click="mention.onInput()"
      @keydown="mention.onKeydown($event)"
      @blur="mention.onBlur()"
      class="w-full bg-transparent text-white placeholder-brand-muted text-[15px] leading-relaxed resize-none outline-hidden min-h-[60px] max-h-[300px]"
      :style="minHeight ? `min-height:${minHeight}` : ''"
    />
    <MentionDropdown :items="mention.open.value ? mention.items.value : []" :active="mention.active.value"
      @pick="mention.pick" @hover="i => mention.active.value = i" />
  </div>
</template>
