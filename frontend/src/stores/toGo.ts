import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export type ToGoItemType = 'event' | 'post' | 'listing' | 'group'

export interface ToGoItem {
  id:          string
  type:        ToGoItemType
  title:       string
  subtitle?:   string   // дата события / автор поста / цена
  imageUrl?:   string
  url:         string   // путь роутера для навигации
  addedAt:     string   // ISO
  note?:       string   // личная заметка
  done:        boolean  // отмечено как выполнено
  // event-specific
  startsAt?:   string
  locationName?: string
}

const LS_KEY = 'bloomly_togo_v1'

function load(): ToGoItem[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const useToGoStore = defineStore('toGo', () => {
  const items = ref<ToGoItem[]>(load())

  // Auto-save on change
  watch(items, (val) => {
    localStorage.setItem(LS_KEY, JSON.stringify(val))
  }, { deep: true })

  // ── Computed ───────────────────────────────────────────────────────────────
  const pending  = computed(() => items.value.filter(i => !i.done))
  const finished = computed(() => items.value.filter(i => i.done))

  const upcomingEvents = computed(() =>
    items.value.filter(i => i.type === 'event' && !i.done && i.startsAt && new Date(i.startsAt) > new Date())
      .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())
  )

  function has(id: string) {
    return items.value.some(i => i.id === id)
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function add(item: Omit<ToGoItem, 'addedAt' | 'done'>) {
    if (has(item.id)) return
    items.value.unshift({ ...item, addedAt: new Date().toISOString(), done: false })
  }

  function remove(id: string) {
    items.value = items.value.filter(i => i.id !== id)
  }

  function toggle(id: string) {
    const item = items.value.find(i => i.id === id)
    if (item) item.done = !item.done
  }

  function setNote(id: string, note: string) {
    const item = items.value.find(i => i.id === id)
    if (item) item.note = note
  }

  function clear() {
    items.value = []
  }

  function clearDone() {
    items.value = items.value.filter(i => !i.done)
  }

  return {
    items,
    pending,
    finished,
    upcomingEvents,
    has,
    add,
    remove,
    toggle,
    setNote,
    clear,
    clearDone,
  }
})
