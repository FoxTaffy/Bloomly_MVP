<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import BIcon from './BIcon.vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  minHeight?: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const router = useRouter()
const textarea = ref<HTMLTextAreaElement | null>(null)

// ── @mention dropdown ────────────────────────────────────────────────────────
const showDropdown = ref(false)
const dropdownUsers = ref<any[]>([])
const dropdownActive = ref(0)
const mentionStartPos = ref(-1)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const onInput = (e: Event) => {
  const el = e.target as HTMLTextAreaElement
  emit('update:modelValue', el.value)

  const cur = el.selectionStart
  const before = el.value.substring(0, cur)
  const match = before.match(/@(\w*)$/)

  if (match) {
    mentionStartPos.value = cur - match[0].length
    const q = match[1]
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`)
        dropdownUsers.value = res.data.data?.users ?? []
        dropdownActive.value = 0
        showDropdown.value = dropdownUsers.value.length > 0
      } catch {
        showDropdown.value = false
      }
    }, 150)
  } else {
    showDropdown.value = false
    dropdownUsers.value = []
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (!showDropdown.value) return
  if (e.key === 'ArrowDown') { e.preventDefault(); dropdownActive.value = (dropdownActive.value + 1) % dropdownUsers.value.length }
  else if (e.key === 'ArrowUp') { e.preventDefault(); dropdownActive.value = (dropdownActive.value - 1 + dropdownUsers.value.length) % dropdownUsers.value.length }
  else if (e.key === 'Enter') { e.preventDefault(); pickUser(dropdownUsers.value[dropdownActive.value]) }
  else if (e.key === 'Escape') { showDropdown.value = false }
}

const pickUser = (user: any) => {
  if (!user) return
  const el = textarea.value!
  const cur = el.selectionStart
  const before = props.modelValue.substring(0, mentionStartPos.value)
  const after = props.modelValue.substring(cur)
  emit('update:modelValue', before + `@${user.username} ` + after)
  showDropdown.value = false
  // Restore focus & move cursor after mention
  const newCursor = before.length + user.username.length + 2
  setTimeout(() => { el.focus(); el.setSelectionRange(newCursor, newCursor) }, 0)
}

const closeDropdown = () => { showDropdown.value = false }
</script>

<template>
  <div class="relative">
    <textarea
      ref="textarea"
      :value="modelValue"
      :placeholder="placeholder"
      autofocus
      @input="onInput"
      @keydown="onKeydown"
      @blur="setTimeout(closeDropdown, 150)"
      class="w-full bg-transparent text-white placeholder-brand-muted text-[15px] leading-relaxed resize-none outline-none min-h-[60px] max-h-[300px]"
      :style="minHeight ? `min-height:${minHeight}` : ''"
    />

    <!-- Mention dropdown -->
    <Transition name="mention-drop">
      <div
        v-if="showDropdown"
        class="absolute left-0 top-full mt-1 w-72 z-50 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1"
      >
        <button
          v-for="(user, i) in dropdownUsers"
          :key="user.id"
          @mousedown.prevent="pickUser(user)"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
          :class="i === dropdownActive ? 'bg-brand-accent/20 text-white' : 'text-brand-muted hover:bg-brand-border hover:text-white'"
        >
          <img v-if="user.avatar_url"
            :src="user.avatar_url"
            class="w-8 h-8 rounded-full object-cover border border-brand-border flex-shrink-0"
          />
          <div v-else class="w-8 h-8 rounded-full border border-brand-border flex-shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs">{{ (user.display_name || user.username || '?')[0].toUpperCase() }}</div>
          <div class="min-w-0">
            <div class="font-bold text-sm truncate">{{ user.display_name || user.username }}</div>
            <div class="text-xs text-brand-muted truncate">@{{ user.username }}</div>
          </div>
          <BIcon name="AtSign" class="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-50" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mention-drop-enter-active { transition: opacity 0.12s, transform 0.12s; }
.mention-drop-leave-active { transition: opacity 0.08s, transform 0.08s; }
.mention-drop-enter-from { opacity: 0; transform: translateY(-4px); }
.mention-drop-leave-to   { opacity: 0; transform: translateY(-4px); }
</style>
