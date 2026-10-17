<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed, onMounted } from 'vue'
import { useGroupsStore, type ArtistQueueItem, type TodoStatus } from '@/stores/groups'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'

const props = defineProps<{ groupId: string; isAdmin: boolean }>()
const groupsStore = useGroupsStore()
const { confirmDialog } = useConfirm()

const items    = ref<ArtistQueueItem[]>([])
const loading  = ref(false)
const saving   = ref(false)

const showModal   = ref(false)
const editingId   = ref<string | null>(null)
const formStatus  = ref<TodoStatus>('WAITING')
const form        = ref({ title: '', description: '' })

const addingInCol = ref<TodoStatus | null>(null)
const inlineTitle = ref('')

const STATUS_CONFIG: Record<TodoStatus, { label: string; colBg: string; headerColor: string; dotColor: string; cardAccent: string }> = {
  WAITING:  { label: 'Ожидание',  colBg: 'bg-[#1a1a2e]', headerColor: 'text-white/50',    dotColor: '#6b7280', cardAccent: 'border-white/10'       },
  SKETCH:   { label: 'Скетч',     colBg: 'bg-[#0d1b35]', headerColor: 'text-blue-400',    dotColor: '#60a5fa', cardAccent: 'border-blue-500/20'    },
  LINEART:  { label: 'Лайнарт',   colBg: 'bg-[#1a0d35]', headerColor: 'text-purple-400',  dotColor: '#a78bfa', cardAccent: 'border-purple-500/20'  },
  COLORING: { label: 'Раскраска', colBg: 'bg-[#2a1500]', headerColor: 'text-orange-400',  dotColor: '#fb923c', cardAccent: 'border-orange-500/20'  },
  FINISHED: { label: 'Готово',    colBg: 'bg-[#0d2218]', headerColor: 'text-emerald-400', dotColor: '#34d399', cardAccent: 'border-emerald-500/20' },
}
const STATUSES: TodoStatus[] = ['WAITING', 'SKETCH', 'LINEART', 'COLORING', 'FINISHED']

function asTodoStatus(s: string): TodoStatus {
  return (STATUSES as string[]).includes(s) ? (s as TodoStatus) : 'WAITING'
}

const byStatus = computed(() => {
  const map: Record<TodoStatus, ArtistQueueItem[]> = { WAITING: [], SKETCH: [], LINEART: [], COLORING: [], FINISHED: [] }
  items.value.forEach(i => map[asTodoStatus(i.status)].push(i))
  return map
})

async function load() {
  loading.value = true
  try { items.value = await groupsStore.fetchTodoItems(props.groupId) }
  finally { loading.value = false }
}
onMounted(load)

function openEdit(item: ArtistQueueItem) {
  editingId.value  = item.id
  formStatus.value = asTodoStatus(item.status)
  form.value       = { title: item.title, description: item.description ?? '' }
  showModal.value  = true
}
function closeModal() { showModal.value = false; editingId.value = null }

async function saveModal() {
  if (!form.value.title.trim()) return
  saving.value = true
  try {
    if (editingId.value) {
      const updated = await groupsStore.updateTodoItem(props.groupId, editingId.value, {
        title: form.value.title, description: form.value.description, status: formStatus.value,
      })
      const idx = items.value.findIndex(i => i.id === editingId.value)
      if (idx !== -1) items.value[idx] = updated
    } else {
      const created = await groupsStore.createTodoItem(props.groupId, {
        title: form.value.title, description: form.value.description || undefined, status: formStatus.value,
      })
      items.value.push(created)
    }
    closeModal()
  } finally { saving.value = false }
}

function startInline(status: TodoStatus) { addingInCol.value = status; inlineTitle.value = '' }
function cancelInline() { addingInCol.value = null; inlineTitle.value = '' }
async function saveInline() {
  if (!inlineTitle.value.trim()) return
  saving.value = true
  try {
    const created = await groupsStore.createTodoItem(props.groupId, {
      title: inlineTitle.value.trim(), status: addingInCol.value!,
    })
    items.value.push(created)
    cancelInline()
  } finally { saving.value = false }
}

async function moveNext(item: ArtistQueueItem) {
  const idx = STATUSES.indexOf(asTodoStatus(item.status))
  if (idx >= STATUSES.length - 1) return
  const updated = await groupsStore.updateTodoItem(props.groupId, item.id, { status: STATUSES[idx + 1] })
  const i = items.value.findIndex(x => x.id === item.id)
  if (i !== -1) items.value[i] = updated
}

async function removeItem(id: string) {
  if (!(await confirmDialog('Удалить карточку?', { danger: true }))) return
  await groupsStore.deleteTodoItem(props.groupId, id)
  items.value = items.value.filter(i => i.id !== id)
}
</script>

<template>
  <div class="stack-y-3">
    <!-- Board header -->
    <div class="flex items-center justify-between px-1">
      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
        <BIcon name="LayoutDashboard" class="w-3.5 h-3.5 text-brand-accent" /> Очередь работ
      </p>
      <span class="text-[10px] text-white/30 font-medium">{{ items.length }} карточек</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-2 py-4 text-white/30 text-sm">
      <BIcon name="Loader" class="w-4 h-4 animate-spin" /><span>Загрузка...</span>
    </div>

    <!-- Kanban -->
    <div v-else class="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1" style="scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent">
      <div v-for="status in STATUSES" :key="status"
        class="shrink-0 w-48 flex flex-col rounded-2xl overflow-hidden"
        :class="STATUS_CONFIG[status].colBg">

        <!-- Column header -->
        <div class="flex items-center justify-between px-3 pt-2.5 pb-2">
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full shrink-0" :style="{ background: STATUS_CONFIG[status].dotColor }" />
            <span class="text-[11px] font-bold uppercase tracking-wide" :class="STATUS_CONFIG[status].headerColor">
              {{ STATUS_CONFIG[status].label }}
            </span>
          </div>
          <span class="text-[10px] text-white/30 font-bold bg-white/5 rounded-md px-1.5 py-0.5 min-w-[18px] text-center">
            {{ byStatus[status].length }}
          </span>
        </div>

        <!-- Cards -->
        <div class="flex flex-col gap-1.5 px-2 flex-1">
          <div v-for="item in byStatus[status]" :key="item.id"
            class="bg-brand-card border rounded-xl p-2.5 group/card cursor-pointer hover:brightness-110 transition-all select-none"
            :class="STATUS_CONFIG[status].cardAccent"
            @click="isAdmin && openEdit(item)">
            <p class="text-[12px] font-semibold text-white leading-snug">{{ item.title }}</p>
            <p v-if="item.description" class="text-[10px] text-white/40 mt-1 leading-relaxed line-clamp-2">{{ item.description }}</p>
            <div v-if="isAdmin" class="flex items-center gap-1 mt-2 pt-2 border-t border-white/5 opacity-0 group-hover/card:opacity-100 transition-opacity">
              <button v-if="STATUSES.indexOf(status) < STATUSES.length - 1"
                @click.stop="moveNext(item)"
                class="text-[9px] flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white/5 text-white/45 hover:bg-white/10 hover:text-white transition-all">
                <BIcon name="ArrowRight" class="w-2.5 h-2.5" /> Далее
              </button>
              <button @click.stop="removeItem(item.id)"
                class="ml-auto w-5 h-5 flex items-center justify-center rounded-md text-white/25 hover:text-brand-error hover:bg-brand-error/10 transition-all">
                <BIcon name="X" class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Inline add -->
          <div v-if="isAdmin && addingInCol === status" class="stack-y-1.5 mt-0.5">
            <textarea v-model="inlineTitle" autofocus rows="2" placeholder="Название карточки..."
              class="w-full bg-brand-card border border-brand-accent/40 rounded-xl px-2.5 py-2 text-[12px] text-white placeholder:text-white/25 focus:outline-hidden resize-none leading-snug"
              @keydown.enter.prevent="saveInline" @keydown.esc="cancelInline" />
            <div class="flex items-center gap-1">
              <button @click="saveInline" :disabled="saving || !inlineTitle.trim()"
                class="flex-1 text-[11px] font-semibold py-1 rounded-lg bg-brand-accent text-white hover:bg-brand-accent/80 disabled:opacity-40 transition-all">
                {{ saving ? '...' : 'Добавить' }}
              </button>
              <button @click="cancelInline"
                class="w-6 h-6 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all">
                <BIcon name="X" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Add card button -->
        <button v-if="isAdmin && addingInCol !== status"
          @click="startInline(status)"
          class="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/70 hover:bg-white/5 transition-all px-3 py-2 mt-1 mx-1 mb-1.5 rounded-xl">
          <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить
        </button>
      </div>
    </div>

    <!-- Edit modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-9999 flex items-center justify-center p-4"
        style="background:rgba(0,0,0,.75)" @click.self="closeModal">
        <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm p-6 stack-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white">{{ editingId ? 'Редактировать' : 'Новая карточка' }}</h3>
            <button @click="closeModal" class="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <input v-model="form.title" placeholder="Название"
            class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-hidden focus:border-brand-accent/60 transition-colors" />
          <textarea v-model="form.description" placeholder="Описание (необязательно)" rows="3"
            class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-hidden focus:border-brand-accent/60 transition-colors resize-none" />
          <div class="stack-y-1.5">
            <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">Колонка</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="s in STATUSES" :key="s" @click="formStatus = s"
                class="text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all"
                :class="formStatus === s ? 'bg-brand-accent/20 text-brand-accent border-brand-accent/40' : 'bg-brand-bg text-white/40 border-brand-border hover:border-white/30 hover:text-white/70'">
                <span class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" :style="{ background: STATUS_CONFIG[s].dotColor }" />
                {{ STATUS_CONFIG[s].label }}
              </button>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button @click="closeModal" class="px-4 py-2 text-sm text-white/50 hover:text-white rounded-xl hover:bg-white/5 transition-all">Отмена</button>
            <button @click="saveModal" :disabled="saving || !form.title.trim()"
              class="px-5 py-2 text-sm font-semibold bg-brand-accent text-white rounded-xl hover:bg-brand-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {{ saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Создать' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
