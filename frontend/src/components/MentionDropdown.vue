<script setup lang="ts">
import BIcon from './BIcon.vue'
import type { MentionItem } from '@/composables/useMentionInput'

// Меню подсказок @упоминаний. Открывается вниз (форма поста) или вверх (поле комментария внизу карточки/окна).
withDefaults(defineProps<{ items: MentionItem[]; active: number; placement?: 'top' | 'bottom' }>(), { placement: 'bottom' })
const emit = defineEmits<{ (e: 'pick', item: MentionItem): void; (e: 'hover', index: number): void }>()
</script>

<template>
  <Transition name="mention-drop">
    <div v-if="items.length" role="listbox" aria-label="Кого упомянуть"
      class="mention-dropdown absolute left-0 w-72 max-w-full z-50 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1"
      :class="placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'">
      <button
        v-for="(item, i) in items"
        :key="item.type + item.id"
        type="button" role="option" :aria-selected="i === active"
        @mousedown.prevent="emit('pick', item)"
        @mouseenter="emit('hover', i)"
        class="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
        :class="i === active ? 'bg-brand-accent/20 text-white' : 'text-white/55 hover:bg-brand-border hover:text-white'">
        <img v-if="item.avatar_url" :src="item.avatar_url" alt=""
          class="w-8 h-8 object-cover border border-brand-border shrink-0"
          :class="item.type === 'group' ? 'rounded-lg' : 'rounded-full'" />
        <div v-else
          class="w-8 h-8 border border-brand-border shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs"
          :class="item.type === 'group' ? 'rounded-lg' : 'rounded-full'">{{ (item.name || '?')[0].toUpperCase() }}</div>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-sm truncate">{{ item.name }}</div>
          <div class="text-xs text-white/55 truncate">{{ item.sub }}</div>
        </div>
        <span v-if="item.friend" class="shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-accent">друг</span>
        <BIcon v-else-if="item.type === 'group'" name="Users" class="w-3.5 h-3.5 shrink-0 opacity-50" />
        <BIcon v-else name="AtSign" class="w-3.5 h-3.5 shrink-0 opacity-50" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.mention-drop-enter-active { transition: opacity 0.12s, transform 0.12s; }
.mention-drop-leave-active { transition: opacity 0.08s, transform 0.08s; }
.mention-drop-enter-from, .mention-drop-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
