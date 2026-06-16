<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useGroupsStore, type ArtistQueueItem, type TodoStatus } from '@/stores/groups'

const route = useRoute()
const router = useRouter()
const nsfwMode = useNsfwMode().nsfwEnabled
const groupId = route.query.group as string | undefined

const groupsStore = useGroupsStore()

const items = ref<ArtistQueueItem[]>([])
const loading = ref(false)
const error = ref('')
const expandedId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const deleting = ref<string | null>(null)
const savingStatus = ref<string | null>(null)

const newTitle = ref('')
const newDesc = ref('')
const showAdd = ref(false)
const adding = ref(false)

const editTitle = ref('')
const editDesc = ref('')
const savingEdit = ref(false)

const STATUS_LIST: { key: TodoStatus; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'WAITING',  label: 'В ожидании', icon: 'Clock',        color: '#94a3b8', bg: '#94a3b810' },
  { key: 'SKETCH',   label: 'Скетч',      icon: 'Pencil',       color: '#f59e0b', bg: '#f59e0b10' },
  { key: 'LINEART',  label: 'Линии',      icon: 'PenTool',      color: '#3b82f6', bg: '#3b82f610' },
  { key: 'COLORING', label: 'Цвет',       icon: 'Palette',      color: '#8b5cf6', bg: '#8b5cf610' },
  { key: 'FINISHED', label: 'Готово',     icon: 'CheckCircle2', color: '#10b981', bg: '#10b98110' },
]

const STATUS_MAP = Object.fromEntries(STATUS_LIST.map(s => [s.key, s]))

const columns = computed(() => {
  const result: Record<TodoStatus, ArtistQueueItem[]> = {
    WAITING: [], SKETCH: [], LINEART: [], COLORING: [], FINISHED: [],
  }
  for (const item of items.value) {
    result[item.status]?.push(item)
  }
  return result
})

const totalActive = computed(() =>
  items.value.filter(i => i.status !== 'FINISHED').length
)

async function load() {
  if (!groupId) return
  loading.value = true
  error.value = ''
  try {
    items.value = await groupsStore.fetchTodoItems(groupId)
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function addItem() {
  if (!groupId || !newTitle.value.trim()) return
  adding.value = true
  try {
    const created = await groupsStore.createTodoItem(groupId, {
      title: newTitle.value.trim(),
      description: newDesc.value.trim() || undefined,
      status: 'WAITING',
    })
    items.value.unshift(created)
    newTitle.value = ''
    newDesc.value = ''
    showAdd.value = false
  } catch (e: any) {
    alert('Ошибка: ' + e.message)
  } finally {
    adding.value = false
  }
}

async function changeStatus(item: ArtistQueueItem, status: TodoStatus) {
  if (!groupId) return
  savingStatus.value = item.id
  try {
    await groupsStore.updateTodoItem(groupId, item.id, { status })
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx !== -1) items.value[idx] = { ...items.value[idx], status }
  } catch (e: any) {
    alert('Ошибка: ' + e.message)
  } finally {
    savingStatus.value = null
  }
}

function startEdit(item: ArtistQueueItem) {
  editingId.value = item.id
  editTitle.value = item.title
  editDesc.value = item.description ?? ''
}

async function saveEdit(item: ArtistQueueItem) {
  if (!groupId || !editTitle.value.trim()) return
  savingEdit.value = true
  try {
    await groupsStore.updateTodoItem(groupId, item.id, {
      title: editTitle.value.trim(),
      description: editDesc.value.trim() || undefined,
    })
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx !== -1) items.value[idx] = { ...items.value[idx], title: editTitle.value.trim(), description: editDesc.value.trim() || null }
    editingId.value = null
  } catch (e: any) {
    alert('Ошибка: ' + e.message)
  } finally {
    savingEdit.value = false
  }
}

async function deleteItem(item: ArtistQueueItem) {
  if (!groupId || !confirm(`Удалить задачу «${item.title}»?`)) return
  deleting.value = item.id
  try {
    await groupsStore.deleteTodoItem(groupId, item.id)
    items.value = items.value.filter(i => i.id !== item.id)
    if (expandedId.value === item.id) expandedId.value = null
  } catch (e: any) {
    alert('Ошибка: ' + e.message)
  } finally {
    deleting.value = null
  }
}

function nextStatus(current: TodoStatus): TodoStatus {
  const idx = STATUS_LIST.findIndex(s => s.key === current)
  return STATUS_LIST[(idx + 1) % STATUS_LIST.length].key
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen text-white font-nunito bg-brand-bg">
    <AppHeader v-model:nsfwMode="nsfwMode" />
    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />
      <main class="flex-1 min-w-0 pb-28 md:pb-20">
        <div class="mt-4 bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">

          <!-- Header -->
          <div class="px-6 py-5 border-b border-brand-border flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-brand-purple/15 border border-brand-purple/25 flex items-center justify-center flex-shrink-0">
              <BIcon name="CheckSquare" class="w-5 h-5 text-brand-purple" />
            </div>
            <div class="flex-1 min-w-0">
              <h1 class="text-lg font-extrabold text-white">Очередь / Todolist</h1>
              <p class="text-xs text-white/40">{{ totalActive }} активных задач</p>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="groupId"
                @click="showAdd = !showAdd"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-purple/20 border border-brand-purple/30 text-xs font-bold text-brand-purple hover:bg-brand-purple/30 transition-all">
                <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить
              </button>
              <button
                @click="router.back()"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border text-xs font-semibold text-white/55 hover:text-white hover:border-brand-accent/50 transition-all">
                <BIcon name="ArrowLeft" class="w-3.5 h-3.5" /> Назад
              </button>
            </div>
          </div>

          <!-- Add form -->
          <div v-if="showAdd" class="mx-6 my-4 bg-brand-bg border border-brand-border rounded-2xl p-5 space-y-3">
            <p class="text-sm font-bold text-white">Новая задача</p>
            <input
              v-model="newTitle"
              placeholder="Название задачи / имя заказчика..."
              @keyup.enter="addItem"
              class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-purple/50" />
            <textarea
              v-model="newDesc"
              placeholder="Описание (необязательно)..."
              rows="2"
              class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-purple/50 resize-none" />
            <div class="flex gap-2 justify-end">
              <button
                @click="showAdd = false"
                class="px-4 py-2 rounded-xl border border-brand-border text-xs font-semibold text-white/50 hover:text-white transition-all">
                Отмена
              </button>
              <button
                @click="addItem"
                :disabled="adding || !newTitle.trim()"
                class="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-purple/20 border border-brand-purple/30 text-xs font-bold text-brand-purple hover:bg-brand-purple/30 transition-all disabled:opacity-40">
                <div v-if="adding" class="w-3.5 h-3.5 border-2 border-brand-purple/30 border-t-brand-purple rounded-full animate-spin" />
                Добавить
              </button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="loading" class="px-6 py-16 flex justify-center">
            <div class="w-8 h-8 border-2 border-brand-purple/30 border-t-brand-purple rounded-full animate-spin" />
          </div>

          <!-- Error -->
          <div v-else-if="error" class="px-6 py-16 text-center text-brand-error text-sm">{{ error }}</div>

          <!-- No group -->
          <div v-else-if="!groupId" class="px-6 py-16 flex flex-col items-center gap-3">
            <BIcon name="AlertCircle" class="w-10 h-10 text-white/20" />
            <p class="text-white/40 text-sm">Группа не выбрана</p>
          </div>

          <!-- Kanban columns -->
          <div v-else class="p-4 sm:p-6">
            <div class="grid grid-cols-1 sm:grid-cols-5 gap-3 items-start">
              <div v-for="stage in STATUS_LIST" :key="stage.key" class="flex flex-col gap-2">

                <!-- Column header -->
                <div
                  class="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/6"
                  :style="`background: ${stage.bg}`">
                  <BIcon :name="stage.icon" class="w-3.5 h-3.5 flex-shrink-0" :style="`color: ${stage.color}`" />
                  <span class="text-xs font-bold flex-1 truncate" :style="`color: ${stage.color}`">{{ stage.label }}</span>
                  <span class="text-[10px] font-bold text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {{ columns[stage.key].length }}
                  </span>
                </div>

                <!-- Cards -->
                <template v-if="columns[stage.key].length">
                  <div
                    v-for="item in columns[stage.key]"
                    :key="item.id"
                    class="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden transition-all"
                    :class="expandedId === item.id ? 'shadow-lg border-brand-accent/20' : 'hover:border-white/15'">

                    <!-- Card header (click to expand) -->
                    <div
                      @click="expandedId = expandedId === item.id ? null : item.id"
                      class="p-3 cursor-pointer">

                      <!-- Editing mode -->
                      <template v-if="editingId === item.id">
                        <div class="space-y-2" @click.stop>
                          <input
                            v-model="editTitle"
                            class="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-purple/50" />
                          <textarea
                            v-model="editDesc"
                            rows="2"
                            class="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-purple/50 resize-none" />
                          <div class="flex gap-1.5">
                            <button
                              @click="editingId = null"
                              class="flex-1 py-1 rounded-lg border border-brand-border text-[11px] text-white/40 hover:text-white transition-all">
                              Отмена
                            </button>
                            <button
                              @click="saveEdit(item)"
                              :disabled="savingEdit"
                              class="flex-1 py-1 rounded-lg bg-brand-purple/20 border border-brand-purple/30 text-[11px] font-bold text-brand-purple hover:bg-brand-purple/30 transition-all">
                              OK
                            </button>
                          </div>
                        </div>
                      </template>

                      <!-- View mode -->
                      <template v-else>
                        <p class="text-[13px] font-semibold text-white leading-snug line-clamp-2">{{ item.title }}</p>
                        <p v-if="item.description && expandedId === item.id" class="text-xs text-white/40 mt-1 leading-relaxed">{{ item.description }}</p>
                        <p class="text-[10px] text-white/30 mt-1.5">{{ fmtDate(item.created_at) }}</p>
                      </template>
                    </div>

                    <!-- Expanded actions -->
                    <template v-if="expandedId === item.id && editingId !== item.id">
                      <div class="border-t border-brand-border/50 px-3 py-2 flex items-center gap-1.5">

                        <!-- Advance status -->
                        <button
                          @click.stop="changeStatus(item, nextStatus(item.status))"
                          :disabled="savingStatus === item.id"
                          :title="`→ ${STATUS_MAP[nextStatus(item.status)]?.label}`"
                          class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-brand-border text-[11px] font-semibold text-white/50 hover:text-white hover:border-white/20 transition-all disabled:opacity-40">
                          <div v-if="savingStatus === item.id" class="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                          <BIcon v-else name="ChevronRight" class="w-3 h-3" />
                          <span>Далее</span>
                        </button>

                        <!-- Edit -->
                        <button
                          @click.stop="startEdit(item)"
                          class="p-1.5 rounded-lg border border-brand-border text-white/40 hover:text-white hover:border-white/20 transition-all">
                          <BIcon name="Pencil" class="w-3.5 h-3.5" />
                        </button>

                        <!-- Delete -->
                        <button
                          @click.stop="deleteItem(item)"
                          :disabled="deleting === item.id"
                          class="p-1.5 rounded-lg border border-brand-border text-white/30 hover:text-red-400 hover:border-red-400/40 transition-all disabled:opacity-40">
                          <div v-if="deleting === item.id" class="w-3.5 h-3.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                          <BIcon v-else name="Trash2" class="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <!-- Status picker -->
                      <div class="border-t border-brand-border/50 px-3 py-2 flex flex-wrap gap-1">
                        <button
                          v-for="s in STATUS_LIST"
                          :key="s.key"
                          @click.stop="changeStatus(item, s.key)"
                          :disabled="savingStatus === item.id"
                          :class="[
                            'px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all disabled:opacity-40',
                            item.status === s.key
                              ? 'border-white/20 bg-white/10 text-white'
                              : 'border-transparent text-white/30 hover:text-white hover:bg-white/5'
                          ]">
                          {{ s.label }}
                        </button>
                      </div>
                    </template>

                  </div>
                </template>

                <!-- Empty column -->
                <div v-else class="border border-dashed border-white/8 rounded-2xl p-4 text-center">
                  <BIcon :name="stage.icon" class="w-4 h-4 mx-auto mb-1 opacity-20" :style="`color: ${stage.color}`" />
                  <p class="text-[11px] text-white/20">Пусто</p>
                </div>

              </div>
            </div>

            <!-- Empty board -->
            <div v-if="!items.length" class="py-12 flex flex-col items-center gap-3 -mt-2">
              <div class="w-14 h-14 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center">
                <BIcon name="CheckSquare" class="w-7 h-7 text-white/20" />
              </div>
              <p class="text-white/40 text-sm font-semibold">Задач пока нет</p>
              <button
                @click="showAdd = true"
                class="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-purple/15 border border-brand-purple/25 text-xs font-bold text-brand-purple hover:bg-brand-purple/25 transition-all">
                <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить первую задачу
              </button>
            </div>

          </div>

        </div>
      </main>
    </div>
  </div>
</template>
