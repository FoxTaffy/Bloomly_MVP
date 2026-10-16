<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '@/api'
import { apiErrorMessage } from '@/lib/apiError'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from './BIcon.vue'
import MediaUpload from './MediaUpload.vue'

// Пользовательские альбомы профиля или группы: список, просмотр, создание и редактирование
// (название, описание, приватность, порядок и состав медиа).
const props = defineProps<{
  userId?: string
  groupId?: string
  /** Можно ли создавать альбомы здесь (владелец профиля / модерация группы). */
  canCreate: boolean
}>()

interface AlbumItem { id: string; media_url: string; position: number }
interface Album {
  id: string; title: string; description: string | null; privacy: 'public' | 'friends' | 'private'
  items: AlbumItem[]; _count?: { items: number }; can_edit?: boolean
}

const { confirmDialog } = useConfirm()

const albums = ref<Album[]>([])
const loading = ref(false)
const loadError = ref('')

async function load() {
  if (!props.userId && !props.groupId) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await api.get('/albums', { params: props.groupId ? { groupId: props.groupId } : { userId: props.userId } })
    albums.value = res.data.data?.albums ?? []
  } catch (e) {
    loadError.value = apiErrorMessage(e) ?? 'Не удалось загрузить альбомы'
  } finally {
    loading.value = false
  }
}
watch(() => [props.userId, props.groupId], load, { immediate: true })

// ── Открытый альбом / редактор ──────────────────────────────────────────────
const open = ref<Album | null>(null)
const isNew = ref(false)
const editing = ref(false)
const saving = ref(false)
const formError = ref('')
const form = ref({ title: '', description: '', privacy: 'public' as Album['privacy'], items: [] as string[] })

const isImage = (url: string) => /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
const privacyOptions = computed(() => [
  { value: 'public', label: 'Все' },
  { value: 'friends', label: props.groupId ? 'Участники группы' : 'Только друзья' },
  { value: 'private', label: props.groupId ? 'Только модерация' : 'Только я' },
])
const privacyLabel = (p: string) => privacyOptions.value.find((o) => o.value === p)?.label ?? ''

function startCreate() {
  open.value = { id: '', title: '', description: null, privacy: 'public', items: [], can_edit: true }
  isNew.value = true
  form.value = { title: '', description: '', privacy: 'public', items: [] }
  formError.value = ''
  editing.value = true
}

async function openAlbum(a: Album) {
  try {
    const res = await api.get(`/albums/${a.id}`)
    open.value = res.data.data.album
    isNew.value = false
    editing.value = false
  } catch (e) {
    loadError.value = apiErrorMessage(e) ?? 'Альбом недоступен'
  }
}

function startEdit() {
  if (!open.value) return
  form.value = {
    title: open.value.title,
    description: open.value.description ?? '',
    privacy: open.value.privacy,
    items: open.value.items.map((i) => i.media_url),
  }
  formError.value = ''
  editing.value = true
}

function close() { open.value = null; editing.value = false; isNew.value = false }

function move(i: number, dir: -1 | 1) {
  const j = i + dir
  const items = form.value.items
  if (j < 0 || j >= items.length) return
  ;[items[i], items[j]] = [items[j], items[i]]
}
function removeItem(i: number) { form.value.items.splice(i, 1) }

function onUploaded(urls: string[]) {
  const have = new Set(form.value.items)
  for (const u of urls) if (!have.has(u)) form.value.items.push(u)
}

async function save() {
  if (!form.value.title.trim()) { formError.value = 'Введите название альбома'; return }
  saving.value = true
  formError.value = ''
  const body = {
    title: form.value.title.trim(),
    description: form.value.description.trim(),
    privacy: form.value.privacy,
    items: form.value.items,
  }
  try {
    if (isNew.value) {
      await api.post('/albums', props.groupId ? { ...body, groupId: props.groupId } : body)
      close()
    } else {
      const res = await api.patch(`/albums/${open.value!.id}`, body)
      open.value = res.data.data.album
      editing.value = false
    }
    await load()
  } catch (e) {
    formError.value = apiErrorMessage(e) ?? 'Не удалось сохранить альбом'
  } finally {
    saving.value = false
  }
}

async function removeAlbum() {
  if (!open.value || isNew.value) return
  if (!await confirmDialog(`Удалить альбом «${open.value.title}»? Сами файлы останутся в постах.`, { danger: true, confirmText: 'Удалить' })) return
  try {
    await api.delete(`/albums/${open.value.id}`)
    close()
    await load()
  } catch (e) {
    formError.value = apiErrorMessage(e) ?? 'Не удалось удалить альбом'
  }
}

defineExpose({ reload: load })
</script>

<template>
  <div class="mb-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-white/85 flex items-center gap-2">
        <BIcon name="FolderOpen" class="w-4 h-4 text-brand-accent" /> Альбомы
      </h3>
      <button v-if="canCreate" type="button" @click="startCreate"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-accent text-white text-xs font-bold hover:brightness-110 transition-all">
        <BIcon name="FolderPlus" class="w-3.5 h-3.5" /> Создать альбом
      </button>
    </div>

    <p v-if="loadError" class="text-xs text-brand-error mb-2">{{ loadError }}</p>
    <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div v-for="n in 3" :key="n" class="aspect-[4/3] rounded-2xl bg-brand-bg border border-brand-border animate-pulse" />
    </div>
    <div v-else-if="albums.length" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <button v-for="a in albums" :key="a.id" type="button" @click="openAlbum(a)"
        class="relative text-left rounded-2xl overflow-hidden aspect-[4/3] border border-brand-border hover:border-brand-accent/60 bg-brand-bg transition-all group">
        <img v-if="a.items[0] && isImage(a.items[0].media_url)" :src="a.items[0].media_url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        <video v-else-if="a.items[0]" :src="a.items[0].media_url" muted playsinline class="w-full h-full object-cover" />
        <div v-else class="w-full h-full flex items-center justify-center text-white/25"><BIcon name="FolderOpen" class="w-8 h-8" /></div>
        <div class="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent">
          <p class="text-xs font-bold text-white truncate">{{ a.title }}</p>
          <p class="text-[10px] text-white/60">{{ a._count?.items ?? a.items.length }} · {{ privacyLabel(a.privacy) }}</p>
        </div>
      </button>
    </div>
    <p v-else-if="!loadError" class="text-xs text-white/45">
      {{ canCreate ? 'Альбомов пока нет — создайте первый.' : 'Альбомов пока нет.' }}
    </p>
  </div>

  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[620] bg-black/70 backdrop-blur-sm flex items-center justify-center px-3" @click.self="close">
      <div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-brand-card border border-brand-border rounded-3xl shadow-2xl p-5">
        <div class="flex items-start justify-between gap-3 mb-4">
          <h3 class="text-base font-bold text-white min-w-0 truncate">{{ isNew ? 'Новый альбом' : open.title }}</h3>
          <button type="button" @click="close" class="text-white/55 hover:text-white text-xl leading-none px-1" aria-label="Закрыть">×</button>
        </div>

        <!-- Просмотр -->
        <template v-if="!editing">
          <p v-if="open.description" class="text-sm text-white/70 whitespace-pre-wrap mb-3">{{ open.description }}</p>
          <p class="text-[11px] text-white/45 mb-3">Доступ: {{ privacyLabel(open.privacy) }}</p>
          <div v-if="open.items.length" class="grid grid-cols-3 gap-1.5">
            <a v-for="it in open.items" :key="it.id" :href="it.media_url" target="_blank" rel="noopener noreferrer"
              class="aspect-square rounded-xl overflow-hidden border border-brand-border bg-brand-bg">
              <img v-if="isImage(it.media_url)" :src="it.media_url" class="w-full h-full object-cover" loading="lazy" />
              <video v-else :src="it.media_url" muted playsinline class="w-full h-full object-cover" />
            </a>
          </div>
          <p v-else class="text-xs text-white/45 py-6 text-center">В альбоме пока ничего нет.</p>
          <p v-if="formError" class="text-xs text-brand-error mt-3">{{ formError }}</p>
          <div v-if="open.can_edit" class="flex gap-2 mt-4">
            <button type="button" @click="startEdit" class="px-4 py-2 rounded-xl bg-brand-accent text-white text-xs font-bold hover:brightness-110">Редактировать</button>
            <button type="button" @click="removeAlbum" class="px-4 py-2 rounded-xl border border-rose-500/40 text-rose-400 text-xs font-bold hover:bg-rose-500/10">Удалить альбом</button>
          </div>
        </template>

        <!-- Редактор -->
        <template v-else>
          <label class="block text-[11px] font-bold text-white/55 mb-1">Название</label>
          <input v-model="form.title" maxlength="80" type="text"
            class="w-full px-3 py-2 mb-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-brand-accent/60" />

          <label class="block text-[11px] font-bold text-white/55 mb-1">Описание</label>
          <textarea v-model="form.description" maxlength="500" rows="3"
            class="w-full px-3 py-2 mb-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-brand-accent/60 resize-none" />

          <label class="block text-[11px] font-bold text-white/55 mb-1">Кто видит альбом</label>
          <select v-model="form.privacy"
            class="w-full px-3 py-2 mb-4 rounded-xl bg-brand-bg border border-white/10 text-sm text-white focus:outline-none focus:border-brand-accent/60">
            <option v-for="o in privacyOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>

          <p class="text-[11px] font-bold text-white/55 mb-1">Файлы ({{ form.items.length }}) — порядок меняется стрелками</p>
          <div v-if="form.items.length" class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
            <div v-for="(url, i) in form.items" :key="url" class="relative aspect-square rounded-xl overflow-hidden border border-brand-border bg-brand-bg">
              <img v-if="isImage(url)" :src="url" class="w-full h-full object-cover" />
              <video v-else :src="url" muted playsinline class="w-full h-full object-cover" />
              <div class="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 text-white text-sm">
                <button type="button" :disabled="i === 0" @click="move(i, -1)" class="px-2 py-0.5 disabled:opacity-30" aria-label="Левее">←</button>
                <button type="button" @click="removeItem(i)" class="px-2 py-0.5 text-rose-300" aria-label="Убрать">×</button>
                <button type="button" :disabled="i === form.items.length - 1" @click="move(i, 1)" class="px-2 py-0.5 disabled:opacity-30" aria-label="Правее">→</button>
              </div>
            </div>
          </div>
          <MediaUpload folder="posts" accept="image/*,video/*" :multiple="true" :max-files="50" @uploaded="onUploaded" />

          <p v-if="formError" class="text-xs text-brand-error mt-3">{{ formError }}</p>
          <div class="flex gap-2 mt-4">
            <button type="button" :disabled="saving" @click="save"
              class="px-4 py-2 rounded-xl bg-brand-accent text-white text-xs font-bold hover:brightness-110 disabled:opacity-50">
              {{ saving ? 'Сохранение…' : 'Сохранить' }}
            </button>
            <button type="button" @click="isNew ? close() : (editing = false)"
              class="px-4 py-2 rounded-xl border border-brand-border text-white/70 text-xs font-bold hover:text-white">Отмена</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
