<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { Bold, Italic, Underline, List } from 'lucide-vue-next'
import { sanitizeHtml } from '@/utils/sanitizeHtml'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const editor = ref<HTMLDivElement | null>(null)
let internalUpdate = false

onMounted(() => {
  if (editor.value) editor.value.innerHTML = sanitizeHtml(props.modelValue)
})

// Sync external resets (e.g. form cleared after publish) without fighting the caret mid-typing
watch(() => props.modelValue, (val) => {
  if (internalUpdate) { internalUpdate = false; return }
  if (editor.value && editor.value.innerHTML !== val) editor.value.innerHTML = sanitizeHtml(val)
})

const onInput = () => {
  if (!editor.value) return
  const clean = sanitizeHtml(editor.value.innerHTML)
  internalUpdate = true
  emit('update:modelValue', clean)
}

const exec = (command: string) => {
  editor.value?.focus()
  document.execCommand(command, false)
  onInput()
}
</script>

<template>
  <div class="rounded-2xl overflow-hidden" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08)">
    <div class="flex items-center gap-1 px-2 py-1.5 border-b border-white/8">
      <button type="button" @mousedown.prevent="exec('bold')" title="Жирный"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/8 transition-all">
        <Bold class="w-3.5 h-3.5" />
      </button>
      <button type="button" @mousedown.prevent="exec('italic')" title="Курсив"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/8 transition-all">
        <Italic class="w-3.5 h-3.5" />
      </button>
      <button type="button" @mousedown.prevent="exec('underline')" title="Подчёркнутый"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/8 transition-all">
        <Underline class="w-3.5 h-3.5" />
      </button>
      <div class="w-px h-4 bg-white/10 mx-1" />
      <button type="button" @mousedown.prevent="exec('insertUnorderedList')" title="Список"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/8 transition-all">
        <List class="w-3.5 h-3.5" />
      </button>
    </div>
    <div
      ref="editor"
      contenteditable="true"
      class="rte-content w-full px-4 py-2.5 text-sm text-white outline-none min-h-[80px] max-h-60 overflow-y-auto"
      :data-placeholder="placeholder ?? ''"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.rte-content:empty::before {
  content: attr(data-placeholder);
  color: rgba(255, 255, 255, 0.25);
  pointer-events: none;
}
.rte-content ul { list-style: disc; padding-left: 1.25rem; }
.rte-content b, .rte-content strong { font-weight: 800; }
</style>
