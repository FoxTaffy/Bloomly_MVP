<script setup lang="ts">
import { apiErrorMessage, errorMessage } from '@/lib/apiError'
import { ref, reactive, computed, onMounted, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useGroupsStore, type ArtistQueueItem, type TodoColumn } from '@/stores/groups'
import { useConfirm } from '@/composables/useConfirm'

const props = withDefaults(defineProps<{
  groupId?: string
  showBack?: boolean
}>(), { showBack: false })

const emit = defineEmits<{ back: [] }>()

const groupsStore = useGroupsStore()
const { confirmDialog } = useConfirm()

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

// ── Kanban columns (customizable per group — full autonomy, own stages/colors/icons) ──
const todoColumns = ref<TodoColumn[]>([])
const columnsLoading = ref(false)

function bg(color: string) { return `${color}10` }

const STATUS_MAP = computed(() => Object.fromEntries(todoColumns.value.map(c => [c.key, c])))

const groupedItems = computed(() => {
  const result: Record<string, ArtistQueueItem[]> = {}
  for (const col of todoColumns.value) result[col.key] = []
  for (const item of items.value) {
    if (!result[item.status]) result[item.status] = []
    result[item.status].push(item)
  }
  return result
})

const totalActive = computed(() => {
  const lastKey = todoColumns.value[todoColumns.value.length - 1]?.key
  return items.value.filter(i => i.status !== lastKey).length
})

async function loadColumns() {
  if (!props.groupId) return
  columnsLoading.value = true
  try {
    todoColumns.value = await groupsStore.fetchTodoColumns(props.groupId)
  } catch { /* keep previous / empty */ }
  finally { columnsLoading.value = false }
}

async function load() {
  if (!props.groupId) return
  loading.value = true
  error.value = ''
  try {
    items.value = await groupsStore.fetchTodoItems(props.groupId)
  } catch (e) {
    error.value = errorMessage(e) ?? ''
  } finally {
    loading.value = false
  }
}

async function addItem() {
  if (!props.groupId || !newTitle.value.trim()) return
  adding.value = true
  try {
    const created = await groupsStore.createTodoItem(props.groupId, {
      title: newTitle.value.trim(),
      description: newDesc.value.trim() || undefined,
      status: todoColumns.value[0]?.key,
    })
    items.value.unshift(created)
    newTitle.value = ''
    newDesc.value = ''
    showAdd.value = false
  } catch (e) {
    alert('Ошибка: ' + errorMessage(e))
  } finally {
    adding.value = false
  }
}

async function changeStatus(item: ArtistQueueItem, status: string) {
  if (!props.groupId) return
  savingStatus.value = item.id
  try {
    await groupsStore.updateTodoItem(props.groupId, item.id, { status })
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx !== -1) items.value[idx] = { ...items.value[idx], status }
  } catch (e) {
    alert('Ошибка: ' + errorMessage(e))
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
  if (!props.groupId || !editTitle.value.trim()) return
  savingEdit.value = true
  try {
    await groupsStore.updateTodoItem(props.groupId, item.id, {
      title: editTitle.value.trim(),
      description: editDesc.value.trim() || undefined,
    })
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx !== -1) items.value[idx] = { ...items.value[idx], title: editTitle.value.trim(), description: editDesc.value.trim() || null }
    editingId.value = null
  } catch (e) {
    alert('Ошибка: ' + errorMessage(e))
  } finally {
    savingEdit.value = false
  }
}

async function deleteItem(item: ArtistQueueItem) {
  if (!props.groupId) return
  if (!(await confirmDialog(`Удалить задачу «${item.title}»?`, { danger: true }))) return
  deleting.value = item.id
  try {
    await groupsStore.deleteTodoItem(props.groupId, item.id)
    items.value = items.value.filter(i => i.id !== item.id)
    if (expandedId.value === item.id) expandedId.value = null
  } catch (e) {
    alert('Ошибка: ' + errorMessage(e))
  } finally {
    deleting.value = null
  }
}

function nextStatus(current: string): string {
  const idx = todoColumns.value.findIndex(s => s.key === current)
  if (idx === -1) return todoColumns.value[0]?.key ?? current
  return todoColumns.value[(idx + 1) % todoColumns.value.length].key
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

// ── Column manager (add / rename / recolor / reorder / delete) ─────────────────
const COLOR_PRESETS = ['#94a3b8', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316']
const ICON_PRESETS = ['Clock', 'Pencil', 'PenTool', 'Palette', 'CheckCircle2', 'Star', 'Flag', 'Zap', 'Package', 'Send', 'Eye', 'MessageCircle', 'AlertCircle', 'ThumbsUp', 'Rocket', 'Archive', 'Circle', 'Hourglass', 'Sparkles', 'Flame']

const showColumnManager = ref(false)
const editColumns = reactive<TodoColumn[]>([])
const savingColumns = ref(false)
const columnsError = ref('')
const pickerFor = ref<{ idx: number; kind: 'color' | 'icon' } | null>(null)

function openColumnManager() {
  editColumns.splice(0, editColumns.length, ...todoColumns.value.map(c => ({ ...c })))
  columnsError.value = ''
  showColumnManager.value = true
}
function closeColumnManager() {
  showColumnManager.value = false
  pickerFor.value = null
}
function addColumn() {
  if (editColumns.length >= 8) return
  editColumns.push({ key: `col_${Date.now()}`, label: 'Новая стадия', icon: 'Circle', color: COLOR_PRESETS[editColumns.length % COLOR_PRESETS.length] })
}
function removeColumn(idx: number) {
  if (editColumns.length <= 1) return
  editColumns.splice(idx, 1)
  pickerFor.value = null
}
function moveColumn(idx: number, dir: -1 | 1) {
  const to = idx + dir
  if (to < 0 || to >= editColumns.length) return
  const [col] = editColumns.splice(idx, 1)
  editColumns.splice(to, 0, col)
}
function togglePicker(idx: number, kind: 'color' | 'icon') {
  pickerFor.value = (pickerFor.value?.idx === idx && pickerFor.value.kind === kind) ? null : { idx, kind }
}

async function saveColumns() {
  if (!props.groupId) return
  const clean = editColumns.filter(c => c.label.trim())
  if (!clean.length) { columnsError.value = 'Нужна хотя бы одна стадия'; return }
  savingColumns.value = true
  columnsError.value = ''
  try {
    todoColumns.value = await groupsStore.updateTodoColumns(props.groupId, clean)
    await load()
    showColumnManager.value = false
  } catch (e) {
    columnsError.value = apiErrorMessage(e) || errorMessage(e) || 'Ошибка сохранения'
  } finally {
    savingColumns.value = false
  }
}

watch(() => props.groupId, () => {
  items.value = []
  todoColumns.value = []
  load()
  loadColumns()
})

onMounted(() => {
  load()
  loadColumns()
})
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">

    <!-- Header -->
    <div class="relative px-6 py-5 border-b border-brand-border flex items-center gap-3 overflow-hidden">
      <div class="absolute inset-0 bg-linear-to-r/srgb from-brand-purple/10 via-transparent to-transparent pointer-events-none" />
      <div class="relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style="background: linear-gradient(135deg, #8b5cf6, #a855f7); box-shadow: 0 4px 16px #8b5cf645">
        <BIcon name="CheckSquare" class="w-5 h-5 text-white" />
      </div>
      <div class="relative flex-1 min-w-0">
        <h1 class="text-lg font-extrabold text-white">Очередь / Todolist</h1>
        <p class="text-xs text-white/40">{{ totalActive }} активных задач</p>
      </div>
      <div class="relative flex items-center gap-2">
        <button
          v-if="groupId"
          @click="openColumnManager"
          title="Настроить стадии"
          class="w-8 h-8 flex items-center justify-center rounded-xl border border-brand-border text-white/50 hover:text-white hover:border-white/20 transition-all">
          <BIcon name="Settings2" class="w-4 h-4" />
        </button>
        <button
          v-if="groupId"
          @click="showAdd = !showAdd"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-purple/20 border border-brand-purple/30 text-xs font-bold text-brand-purple hover:bg-brand-purple/30 transition-all">
          <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить
        </button>
        <button
          v-if="showBack"
          @click="emit('back')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border text-xs font-semibold text-white/55 hover:text-white hover:border-brand-accent/50 transition-all">
          <BIcon name="ArrowLeft" class="w-3.5 h-3.5" /> Назад
        </button>
      </div>
    </div>

    <!-- Column manager -->
    <Transition name="col-mgr">
      <div v-if="showColumnManager" class="mx-6 my-4 bg-brand-bg border border-brand-border rounded-2xl p-5 stack-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-bold text-white">Стадии канбана</p>
          <p class="text-[11px] text-white/35">Своя раскладка для этой группы</p>
        </div>

        <div class="stack-y-2">
          <div v-for="(col, idx) in editColumns" :key="col.key" class="relative bg-brand-card border border-brand-border rounded-xl p-2.5 flex items-center gap-2">
            <button @click="togglePicker(idx, 'color')"
              class="w-7 h-7 rounded-lg border border-white/15 shrink-0" :style="`background:${col.color}`" />
            <button @click="togglePicker(idx, 'icon')"
              class="w-7 h-7 rounded-lg border border-brand-border flex items-center justify-center shrink-0 text-white/60 hover:text-white transition-colors">
              <BIcon :name="col.icon" class="w-4 h-4" />
            </button>
            <input v-model="col.label" placeholder="Название стадии"
              class="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-white/25 focus:outline-hidden" />
            <div class="flex items-center gap-0.5 shrink-0">
              <button @click="moveColumn(idx, -1)" :disabled="idx === 0"
                class="p-1 rounded-lg text-white/30 hover:text-white disabled:opacity-20 disabled:hover:text-white/30 transition-colors">
                <BIcon name="ChevronUp" class="w-3.5 h-3.5" />
              </button>
              <button @click="moveColumn(idx, 1)" :disabled="idx === editColumns.length - 1"
                class="p-1 rounded-lg text-white/30 hover:text-white disabled:opacity-20 disabled:hover:text-white/30 transition-colors">
                <BIcon name="ChevronDown" class="w-3.5 h-3.5" />
              </button>
              <button @click="removeColumn(idx)" :disabled="editColumns.length <= 1"
                class="p-1 rounded-lg text-white/30 hover:text-red-400 disabled:opacity-20 disabled:hover:text-white/30 transition-colors">
                <BIcon name="Trash2" class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Color picker -->
            <div v-if="pickerFor?.idx === idx && pickerFor.kind === 'color'"
              class="absolute z-20 top-full left-0 mt-1 bg-brand-card border border-brand-border rounded-xl p-2.5 shadow-xl grid grid-cols-5 gap-1.5">
              <button v-for="c in COLOR_PRESETS" :key="c" @click="col.color = c; pickerFor = null"
                class="w-6 h-6 rounded-lg border transition-transform hover:scale-110"
                :class="col.color === c ? 'border-white' : 'border-white/15'" :style="`background:${c}`" />
            </div>

            <!-- Icon picker -->
            <div v-if="pickerFor?.idx === idx && pickerFor.kind === 'icon'"
              class="absolute z-20 top-full left-0 mt-1 bg-brand-card border border-brand-border rounded-xl p-2.5 shadow-xl grid grid-cols-5 gap-1.5 w-[200px]">
              <button v-for="ic in ICON_PRESETS" :key="ic" @click="col.icon = ic; pickerFor = null"
                class="w-7 h-7 rounded-lg border flex items-center justify-center transition-colors"
                :class="col.icon === ic ? 'border-brand-purple text-brand-purple bg-brand-purple/10' : 'border-brand-border text-white/50 hover:text-white'">
                <BIcon :name="ic" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <button v-if="editColumns.length < 8" @click="addColumn"
          class="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-brand-border text-xs font-semibold text-white/40 hover:text-white hover:border-white/25 transition-all">
          <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить стадию
        </button>

        <p v-if="columnsError" class="text-xs text-brand-error">{{ columnsError }}</p>

        <div class="flex gap-2 justify-end pt-1">
          <button @click="closeColumnManager"
            class="px-4 py-2 rounded-xl border border-brand-border text-xs font-semibold text-white/50 hover:text-white transition-all">
            Отмена
          </button>
          <button @click="saveColumns" :disabled="savingColumns"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-purple/20 border border-brand-purple/30 text-xs font-bold text-brand-purple hover:bg-brand-purple/30 transition-all disabled:opacity-40">
            <div v-if="savingColumns" class="w-3.5 h-3.5 border-2 border-brand-purple/30 border-t-brand-purple rounded-full animate-spin" />
            Сохранить
          </button>
        </div>
      </div>
    </Transition>

    <!-- Add form -->
    <div v-if="showAdd" class="mx-6 my-4 bg-brand-bg border border-brand-border rounded-2xl p-5 stack-y-3">
      <p class="text-sm font-bold text-white">Новая задача</p>
      <input
        v-model="newTitle"
        placeholder="Название задачи / имя заказчика..."
        @keyup.enter="addItem"
        class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-hidden focus:border-brand-purple/50" />
      <textarea
        v-model="newDesc"
        placeholder="Описание (необязательно)..."
        rows="2"
        class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-hidden focus:border-brand-purple/50 resize-none" />
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
    <div v-if="loading || columnsLoading" class="px-6 py-16 flex justify-center">
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
      <div class="todo-grid gap-3 items-start" :style="{ '--cols': Math.min(todoColumns.length, 5) }">
        <div v-for="stage in todoColumns" :key="stage.key" class="flex flex-col gap-2">

          <!-- Column header -->
          <div class="stack-y-1.5">
            <div class="flex items-center gap-2 px-1">
              <div class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" :style="`background: ${stage.color}22`">
                <BIcon :name="stage.icon" class="w-3.5 h-3.5" :style="`color: ${stage.color}`" />
              </div>
              <span class="text-xs font-bold flex-1 truncate text-white/85">{{ stage.label }}</span>
              <span class="text-[10px] font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded-full shrink-0">
                {{ groupedItems[stage.key]?.length ?? 0 }}
              </span>
            </div>
            <div class="h-[3px] rounded-full" :style="`background: linear-gradient(90deg, ${stage.color}, ${stage.color}05)`" />
          </div>

          <!-- Cards -->
          <template v-if="groupedItems[stage.key]?.length">
            <div
              v-for="item in groupedItems[stage.key]"
              :key="item.id"
              class="bg-brand-bg border border-brand-border border-l-[3px] rounded-2xl overflow-hidden transition-all"
              :style="{ borderLeftColor: stage.color }"
              :class="expandedId === item.id ? 'shadow-lg border-brand-accent/20' : 'hover:border-white/15'">

              <!-- Card header (click to expand) -->
              <div
                @click="expandedId = expandedId === item.id ? null : item.id"
                class="p-3 cursor-pointer">

                <!-- Editing mode -->
                <template v-if="editingId === item.id">
                  <div class="stack-y-2" @click.stop>
                    <input
                      v-model="editTitle"
                      class="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-hidden focus:border-brand-purple/50" />
                    <textarea
                      v-model="editDesc"
                      rows="2"
                      class="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-hidden focus:border-brand-purple/50 resize-none" />
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
                  <router-link v-if="item.order_id && groupId" @click.stop
                    :to="{ name: 'group-order', params: { slugOrId: groupId, orderId: item.order_id } }"
                    class="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-brand-accent hover:underline">
                    <BIcon name="Package" class="w-3 h-3" />
                    Заказ · {{ item.order?.customer?.display_name || item.order?.customer?.username || 'заказчик' }}
                  </router-link>
                  <p class="text-[10px] text-white/30 mt-1.5">
                    {{ fmtDate(item.created_at) }}<span v-if="item.order?.deadline_at"> · срок {{ fmtDate(item.order.deadline_at) }}</span>
                  </p>
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
                    v-for="s in todoColumns"
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
          <div v-else class="rounded-2xl p-5 text-center" :style="`background: ${bg(stage.color)}`">
            <BIcon :name="stage.icon" class="w-4 h-4 mx-auto mb-1.5 opacity-30" :style="`color: ${stage.color}`" />
            <p class="text-[11px] text-white/25">Пусто</p>
          </div>

        </div>
      </div>

      <!-- Empty board -->
      <div v-if="!items.length" class="pt-8 flex flex-col items-center gap-1">
        <p class="text-white/25 text-xs">Задач пока нет — начните с первой</p>
      </div>

    </div>

  </div>
</template>

<style scoped>
.todo-grid {
  display: grid;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) {
  .todo-grid {
    grid-template-columns: repeat(var(--cols, 5), minmax(0, 1fr));
  }
}
.col-mgr-enter-active,
.col-mgr-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.col-mgr-enter-from,
.col-mgr-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
