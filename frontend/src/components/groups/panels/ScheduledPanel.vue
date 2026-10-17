<script setup lang="ts">
import { apiErrorMessage, errorMessage } from '@/lib/apiError'
import { ref, computed, onMounted, watch } from 'vue'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { utcToZonedParts, zonedTimeToUtcIso } from '@/lib/timezone'
import * as fmt from '@/lib/format'

interface ScheduledPost {
  id: string
  content: string
  media_urls: string[]
  is_nsfw: boolean
  category: string | null
  tags: string[]
  status: 'draft' | 'scheduled' | 'failed'
  scheduled_at: string | null
  timezone: string | null
  repeat_interval: 'daily' | 'weekly' | 'monthly' | null
  last_error: string | null
}

const props = defineProps<{ groupId?: string }>()

const posts = ref<ScheduledPost[]>([])
const isLoading = ref(true)
const busyIds = ref<Set<string>>(new Set())
const actionError = ref('')
let actionErrorTimer: ReturnType<typeof setTimeout> | null = null
function flashActionError(msg: string) {
  actionError.value = msg
  if (actionErrorTimer) clearTimeout(actionErrorTimer)
  actionErrorTimer = setTimeout(() => { actionError.value = '' }, 4000)
}

const REPEAT_LABELS: Record<string, string> = { daily: 'Каждый день', weekly: 'Каждую неделю', monthly: 'Каждый месяц' }
const STATUS_LABELS: Record<string, string> = { draft: 'Черновик', scheduled: 'Запланировано', failed: 'Ошибка публикации' }

async function fetchList() {
  if (!props.groupId) return
  isLoading.value = true
  try {
    const res = await api.get('/posts/scheduled', { params: { groupId: props.groupId } })
    if (res.data.success) posts.value = res.data.data.posts ?? []
  } catch (e) { console.error('Failed to load group scheduled posts', e) }
  finally { isLoading.value = false }
}

const formatScheduled = fmt.formatScheduled

async function publishNow(id: string) {
  if (busyIds.value.has(id)) return
  busyIds.value.add(id)
  try {
    const res = await api.post(`/posts/scheduled/${id}/publish-now`)
    if (res.data.success) posts.value = posts.value.filter(p => p.id !== id)
  } catch (e) {
    flashActionError(apiErrorMessage(e) || 'Не удалось опубликовать')
  } finally { busyIds.value.delete(id) }
}

const editingId = ref<string | null>(null)
const editContent = ref('')
const editDate = ref('')
const editTime = ref('')
const editError = ref('')

function startEdit(p: ScheduledPost) {
  editingId.value = p.id
  editContent.value = p.content
  editError.value = ''
  if (p.scheduled_at) {
    const { date, time } = utcToZonedParts(p.scheduled_at, p.timezone || 'UTC')
    editDate.value = date
    editTime.value = time
  } else {
    editDate.value = ''
    editTime.value = ''
  }
}
function cancelEdit() { editingId.value = null }

async function saveEdit(p: ScheduledPost) {
  if (busyIds.value.has(p.id)) return
  busyIds.value.add(p.id)
  editError.value = ''
  try {
    const body: Record<string, unknown> = { content: editContent.value.trim() }
    if (editDate.value || editTime.value) {
      if (!editDate.value || !editTime.value) throw new Error('Укажите и дату, и время публикации')
      body.scheduledAt = zonedTimeToUtcIso(`${editDate.value}T${editTime.value}`, p.timezone || 'UTC')
      body.timezone = p.timezone || 'UTC'
    } else if (p.scheduled_at) {
      body.scheduledAt = null
    }
    const res = await api.patch(`/posts/scheduled/${p.id}`, body)
    if (res.data.success) {
      const idx = posts.value.findIndex(x => x.id === p.id)
      if (idx !== -1) posts.value[idx] = res.data.data.post
      editingId.value = null
    }
  } catch (e) {
    editError.value = apiErrorMessage(e) || errorMessage(e) || 'Не удалось сохранить изменения'
  } finally {
    busyIds.value.delete(p.id)
  }
}

async function cancel(id: string) {
  if (busyIds.value.has(id)) return
  busyIds.value.add(id)
  try {
    await api.delete(`/posts/scheduled/${id}`)
    posts.value = posts.value.filter(p => p.id !== id)
  } catch (e) {
    flashActionError(apiErrorMessage(e) || 'Не удалось удалить')
  } finally { busyIds.value.delete(id) }
}

const grouped = computed(() => ({
  failed: posts.value.filter(p => p.status === 'failed'),
  scheduled: posts.value.filter(p => p.status === 'scheduled'),
  draft: posts.value.filter(p => p.status === 'draft'),
}))

onMounted(fetchList)
watch(() => props.groupId, fetchList)
</script>

<template>
  <div class="stack-y-4">
    <p class="text-xs text-white/40">
      Черновики и запланированные публикации от имени группы — создаются через иконку часов в композере на главной странице (выберите группу в переключателе «от чьего имени»).
    </p>

    <div v-if="actionError" class="flex items-center gap-2 bg-brand-error/10 border border-brand-error/30 text-brand-error text-xs font-semibold rounded-2xl px-4 py-3">
      <BIcon name="AlertTriangle" class="w-4 h-4 shrink-0" /> {{ actionError }}
    </div>

    <div v-if="isLoading" class="text-center text-white/40 text-sm py-10">Загрузка…</div>

    <div v-else-if="posts.length === 0" class="bg-brand-card border border-brand-border rounded-3xl px-6 py-14 text-center">
      <BIcon name="CalendarClock" class="w-10 h-10 text-white/20 mx-auto mb-3" />
      <p class="text-white/55 text-sm">Пока нет запланированных публикаций или черновиков от имени группы</p>
    </div>

    <template v-else>
      <section v-for="(group, key) in grouped" :key="key">
        <template v-if="group.length">
          <h2 class="text-xs font-bold uppercase tracking-wide text-white/40 mb-2 px-1">
            {{ STATUS_LABELS[key] }} ({{ group.length }})
          </h2>
          <div class="stack-y-2 mb-4">
            <div v-for="p in group" :key="p.id" class="bg-brand-card border border-brand-border rounded-2xl px-5 py-4">
              <div v-if="editingId === p.id" class="stack-y-2">
                <textarea
                  v-model="editContent"
                  rows="3"
                  class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-hidden focus:border-brand-accent transition-colors resize-none"
                />
                <div class="grid grid-cols-2 gap-2">
                  <input v-model="editDate" type="date" class="bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-brand-accent transition-colors" />
                  <input v-model="editTime" type="time" class="bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-brand-accent transition-colors" />
                </div>
                <p class="text-[11px] text-white/35">Оставьте дату и время пустыми для черновика, или укажите их, чтобы запланировать публикацию.</p>
                <p v-if="editError" class="text-[11px] text-brand-error">{{ editError }}</p>
                <div class="flex items-center gap-2">
                  <button @click="saveEdit(p)" :disabled="busyIds.has(p.id)" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-accent text-white hover:bg-brand-accent-plus transition-all disabled:opacity-40">Сохранить</button>
                  <button @click="cancelEdit" class="px-3 py-1.5 rounded-xl text-xs font-semibold text-white/55 hover:text-white transition-all">Отмена</button>
                </div>
              </div>
              <div v-else class="flex items-start gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-white/90 whitespace-pre-wrap wrap-break-word line-clamp-3">{{ p.content || '(без текста)' }}</p>
                  <div class="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-white/45">
                    <span v-if="p.scheduled_at" class="inline-flex items-center gap-1">
                      <BIcon name="Clock" class="w-3 h-3" /> {{ formatScheduled(p) }}
                    </span>
                    <span v-if="p.repeat_interval" class="inline-flex items-center gap-1 text-brand-accent">
                      <BIcon name="Repeat" class="w-3 h-3" /> {{ REPEAT_LABELS[p.repeat_interval] }}
                    </span>
                    <span v-if="p.category" class="px-2 py-0.5 rounded-full bg-brand-bg border border-brand-border">{{ p.category }}</span>
                    <span v-if="p.is_nsfw" class="px-2 py-0.5 rounded-full border border-brand-error/50 text-brand-error">NSFW</span>
                    <span v-if="p.media_urls?.length" class="inline-flex items-center gap-1">
                      <BIcon name="Image" class="w-3 h-3" /> {{ p.media_urls.length }}
                    </span>
                  </div>
                  <p v-if="p.status === 'failed' && p.last_error" class="text-[11px] text-brand-error mt-1.5">{{ p.last_error }}</p>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button @click="startEdit(p)" title="Редактировать" class="p-2 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
                    <BIcon name="Pencil" class="w-4 h-4" />
                  </button>
                  <button @click="publishNow(p.id)" :disabled="busyIds.has(p.id)" title="Опубликовать сейчас" class="p-2 rounded-xl text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-all disabled:opacity-40">
                    <BIcon name="Send" class="w-4 h-4" />
                  </button>
                  <button @click="cancel(p.id)" :disabled="busyIds.has(p.id)" title="Удалить" class="p-2 rounded-xl text-white/55 hover:text-brand-error hover:bg-brand-bg transition-all disabled:opacity-40">
                    <BIcon name="Trash2" class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
