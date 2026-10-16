<script setup lang="ts">
import { ref } from 'vue'
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

const textarea = ref<HTMLTextAreaElement | null>(null)

// ── Unified dropdown item type ────────────────────────────────────────────────
type DropdownItem = {
  type: 'user' | 'group'
  id: string
  slug: string        // username for users, slug for groups
  name: string        // display_name or group name
  sub: string         // @username or @slug label
  avatar_url: string | null
}

// ── @mention dropdown ────────────────────────────────────────────────────────
const showDropdown = ref(false)
const dropdownItems = ref<DropdownItem[]>([])
const dropdownActive = ref(0)
const mentionStartPos = ref(-1)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const onInput = (e: Event) => {
  const el = e.target as HTMLTextAreaElement
  emit('update:modelValue', el.value)

  const cur = el.selectionStart
  const before = el.value.substring(0, cur)
  const match = before.match(/@([\w-]*)$/)

  if (match) {
    mentionStartPos.value = cur - match[0].length
    const q = match[1]
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(async () => {
      try {
        const [usersRes, groupsRes] = await Promise.all([
          api.get(`/users/search?q=${encodeURIComponent(q)}`).catch(() => null),
          api.get(`/groups?search=${encodeURIComponent(q)}&limit=3`).catch(() => null),
        ])
        const users: DropdownItem[] = ((usersRes?.data.data?.users ?? []) as any[]).slice(0, 5).map((u: any) => ({
          type: 'user' as const,
          id: u.id,
          slug: u.username,
          name: u.display_name || u.username,
          sub: `@${u.username}`,
          avatar_url: u.avatar_url ?? null,
        }))
        const groups: DropdownItem[] = ((groupsRes?.data.data?.groups ?? []) as any[]).slice(0, 3).map((g: any) => ({
          type: 'group' as const,
          id: g.id,
          slug: g.slug,
          name: g.name,
          sub: `@${g.slug}`,
          avatar_url: g.avatar_url ?? null,
        }))
        dropdownItems.value = [...users, ...groups]
        dropdownActive.value = 0
        showDropdown.value = dropdownItems.value.length > 0
      } catch {
        showDropdown.value = false
      }
    }, 150)
  } else {
    showDropdown.value = false
    dropdownItems.value = []
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (!showDropdown.value) return
  if (e.key === 'ArrowDown') { e.preventDefault(); dropdownActive.value = (dropdownActive.value + 1) % dropdownItems.value.length }
  else if (e.key === 'ArrowUp') { e.preventDefault(); dropdownActive.value = (dropdownActive.value - 1 + dropdownItems.value.length) % dropdownItems.value.length }
  else if (e.key === 'Enter') { e.preventDefault(); pickItem(dropdownItems.value[dropdownActive.value]) }
  else if (e.key === 'Escape') { showDropdown.value = false }
}

const pickItem = (item: DropdownItem) => {
  if (!item) return
  const el = textarea.value!
  const cur = el.selectionStart
  const before = props.modelValue.substring(0, mentionStartPos.value)
  const after = props.modelValue.substring(cur)
  emit('update:modelValue', before + `@${item.slug} ` + after)
  showDropdown.value = false
  const newCursor = before.length + item.slug.length + 2
  window.setTimeout(() => { el.focus(); el.setSelectionRange(newCursor, newCursor) }, 0)
}

const closeDropdown = () => { showDropdown.value = false }
const onBlur = () => { window.setTimeout(closeDropdown, 150) }
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
      @blur="onBlur"
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
          v-for="(item, i) in dropdownItems"
          :key="item.id"
          @mousedown.prevent="pickItem(item)"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
          :class="i === dropdownActive ? 'bg-brand-accent/20 text-white' : 'text-white/55 hover:bg-brand-border hover:text-white'"
        >
          <!-- Avatar: round for users, rounded-lg for groups -->
          <img v-if="item.avatar_url"
            :src="item.avatar_url"
            class="w-8 h-8 object-cover border border-brand-border flex-shrink-0"
            :class="item.type === 'group' ? 'rounded-lg' : 'rounded-full'"
          />
          <div v-else
            class="w-8 h-8 border border-brand-border flex-shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs"
            :class="item.type === 'group' ? 'rounded-lg' : 'rounded-full'"
          >{{ (item.name || '?')[0].toUpperCase() }}</div>

          <div class="min-w-0 flex-1">
            <div class="font-bold text-sm truncate">{{ item.name }}</div>
            <div class="text-xs text-white/55 truncate">{{ item.sub }}</div>
          </div>

          <!-- Type indicator -->
          <BIcon v-if="item.type === 'group'" name="Users" class="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-50" />
          <BIcon v-else name="AtSign" class="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-50" />
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
