<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '@/api'
import { apiErrorMessage } from '@/lib/apiError'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from './BIcon.vue'
import MediaUpload from './MediaUpload.vue'
import MediaLightbox from './MediaLightbox.vue'
import StickerReorderGrid from './StickerReorderGrid.vue'

// Все альбомы профиля или группы в одной сетке: созданные вручную (можно создавать и
// редактировать — название, описание, приватность, состав и порядок перетаскиванием)
// и встроенные, которые собирает страница сама (Референсы, Фурсона, по месяцам…).
export interface BuiltinAlbum {
  id: string
  label: string
  emoji?: string
  /** BIcon вместо эмодзи, например CalendarDays у альбомов по месяцам. */
  icon?: string
  urls: { url: string; is_nsfw?: boolean }[]
}

const props = withDefaults(defineProps<{
  userId?: string
  groupId?: string
  /** Можно ли создавать альбомы здесь (владелец профиля / модерация группы). */
  canCreate: boolean
  builtin?: BuiltinAlbum[]
  builtinLoading?: boolean
  /** Показывать 18+ без размытия. */
  nsfwMode?: boolean
}>(), { builtin: () => [], builtinLoading: false, nsfwMode: false })

interface AlbumItem { id: string; media_url: string; position: number }
interface Album {
  id: string; title: string; description: string | null; privacy: 'public' | 'friends' | 'private'
  items: AlbumItem[]; _count?: { items: number }; can_edit?: boolean
}

const MAX_ITEMS = 200
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

const isImage = (url: string) => /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
const privacyOptions = computed(() => [
  { value: 'public', label: 'Все' },
  { value: 'friends', label: props.groupId ? 'Участники группы' : 'Только друзья' },
  { value: 'private', label: props.groupId ? 'Только модерация' : 'Только я' },
])
const privacyLabel = (p: string) => privacyOptions.value.find((o) => o.value === p)?.label ?? ''
const isEmpty = computed(() => !albums.value.length && !props.builtin.length)

// ── Просмотр альбома (общий для своих и встроенных) ────────────────────────
interface Viewed {
  label: string; emoji?: string; icon?: string; description?: string | null
  privacy?: string; urls: { url: string; is_nsfw?: boolean }[]; custom?: Album
}
const viewed = ref<Viewed | null>(null)
const lightboxIndex = ref<number | null>(null)
const viewedUrls = computed(() => viewed.value?.urls.map((u) => u.url) ?? [])

function openBuiltin(b: BuiltinAlbum) {
  // Одиночный файл открываем сразу во весь экран — пустое окно с одной плиткой ни к чему.
  viewed.value = { label: b.label, emoji: b.emoji, icon: b.icon, urls: b.urls }
  if (b.urls.length === 1) lightboxIndex.value = 0
}

function showCustom(a: Album) {
  viewed.value = {
    label: a.title, icon: 'FolderOpen', description: a.description, privacy: a.privacy,
    urls: a.items.map((i) => ({ url: i.media_url })), custom: a,
  }
}

async function openCustom(a: Album) {
  try {
    const res = await api.get(`/albums/${a.id}`)
    showCustom(res.data.data.album)
  } catch (e) {
    loadError.value = apiErrorMessage(e) ?? 'Альбом недоступен'
  }
}

// Закрыли лайтбокс у альбома из одного файла — окно альбома тоже не нужно.
watch(lightboxIndex, (i) => { if (i === null && viewed.value && viewed.value.urls.length === 1 && !viewed.value.custom) viewed.value = null })

function closeViewer() { viewed.value = null; lightboxIndex.value = null }

// ── Редактор ────────────────────────────────────────────────────────────────
const editing = ref<{ album: Album | null } | null>(null)
const saving = ref(false)
const formError = ref('')
const form = ref({ title: '', description: '', privacy: 'public' as Album['privacy'] })
// key нужен сетке перетаскивания; URL в альбоме уникален (дубли отбрасываются при добавлении).
const items = ref<{ key: string; url: string }[]>([])

function startCreate() {
  form.value = { title: '', description: '', privacy: 'public' }
  items.value = []
  formError.value = ''
  editing.value = { album: null }
}

function startEdit(a: Album) {
  form.value = { title: a.title, description: a.description ?? '', privacy: a.privacy }
  items.value = a.items.map((i) => ({ key: i.media_url, url: i.media_url }))
  formError.value = ''
  editing.value = { album: a }
}

function closeEditor() { editing.value = null }

function removeItem(url: string) { items.value = items.value.filter((i) => i.url !== url) }

function onUploaded(urls: string[]) {
  const have = new Set(items.value.map((i) => i.url))
  for (const u of urls) {
    if (have.has(u)) continue
    if (items.value.length >= MAX_ITEMS) { formError.value = `В альбоме не больше ${MAX_ITEMS} файлов`; break }
    items.value.push({ key: u, url: u })
    have.add(u)
  }
}

async function save() {
  if (!editing.value) return
  if (!form.value.title.trim()) { formError.value = 'Введите название альбома'; return }
  saving.value = true
  formError.value = ''
  const body = {
    title: form.value.title.trim(),
    description: form.value.description.trim(),
    privacy: form.value.privacy,
    items: items.value.map((i) => i.url),
  }
  try {
    const existing = editing.value.album
    if (existing) {
      const res = await api.patch(`/albums/${existing.id}`, body)
      showCustom(res.data.data.album)
    } else {
      await api.post('/albums', props.groupId ? { ...body, groupId: props.groupId } : body)
    }
    editing.value = null
    await load()
  } catch (e) {
    formError.value = apiErrorMessage(e) ?? 'Не удалось сохранить альбом'
  } finally {
    saving.value = false
  }
}

async function removeAlbum(a: Album) {
  if (!await confirmDialog(`Удалить альбом «${a.title}»? Сами файлы останутся в постах.`, { danger: true, confirmText: 'Удалить' })) return
  try {
    await api.delete(`/albums/${a.id}`)
    closeViewer()
    await load()
  } catch (e) {
    loadError.value = apiErrorMessage(e) ?? 'Не удалось удалить альбом'
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
    <div v-if="(loading || builtinLoading) && isEmpty" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div v-for="n in 3" :key="n" class="aspect-4/3 rounded-2xl bg-brand-bg border border-brand-border animate-pulse" />
    </div>
    <div v-else-if="!isEmpty" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <!-- Созданные вручную -->
      <button v-for="a in albums" :key="a.id" type="button" @click="openCustom(a)"
        class="relative text-left rounded-2xl overflow-hidden aspect-4/3 border border-brand-border hover:border-brand-accent/60 bg-brand-bg transition-all group">
        <img v-if="a.items[0] && isImage(a.items[0].media_url)" :src="a.items[0].media_url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        <video v-else-if="a.items[0]" :src="a.items[0].media_url" muted playsinline class="w-full h-full object-cover" />
        <div v-else class="w-full h-full flex items-center justify-center text-white/25"><BIcon name="FolderOpen" class="w-8 h-8" /></div>
        <div class="absolute inset-x-0 bottom-0 p-2.5 bg-linear-to-t/srgb from-black/80 to-transparent">
          <p class="text-xs font-bold text-white truncate flex items-center gap-1.5"><BIcon name="FolderOpen" class="w-3 h-3 text-brand-accent/80 shrink-0" />{{ a.title }}</p>
          <p class="text-[10px] text-white/60">{{ a._count?.items ?? a.items.length }} · {{ privacyLabel(a.privacy) }}</p>
        </div>
      </button>

      <!-- Встроенные -->
      <button v-for="b in builtin" :key="b.id" type="button" @click="openBuiltin(b)"
        class="relative text-left rounded-2xl overflow-hidden aspect-4/3 border border-brand-border hover:border-brand-accent/60 bg-brand-bg transition-all group">
        <div v-if="b.urls.length >= 4" class="grid grid-cols-2 gap-0.5 w-full h-full">
          <div v-for="(item, i) in b.urls.slice(0, 4)" :key="i" class="overflow-hidden">
            <img v-if="isImage(item.url)" :src="item.url" :class="['w-full h-full object-cover', item.is_nsfw && !nsfwMode ? 'blur-lg' : '']" loading="lazy" />
            <div v-else class="w-full h-full bg-brand-bg/60 flex items-center justify-center"><BIcon name="Play" class="w-5 h-5 text-white/40" /></div>
          </div>
        </div>
        <img v-else-if="b.urls[0] && isImage(b.urls[0].url)" :src="b.urls[0].url"
          :class="['w-full h-full object-cover group-hover:scale-105 transition-transform duration-300', b.urls[0].is_nsfw && !nsfwMode ? 'blur-lg' : '']" loading="lazy" />
        <div v-else class="w-full h-full flex items-center justify-center text-3xl text-white/25">
          <template v-if="b.emoji">{{ b.emoji }}</template><BIcon v-else name="Play" class="w-8 h-8" />
        </div>
        <div class="absolute inset-x-0 bottom-0 p-2.5 bg-linear-to-t/srgb from-black/80 to-transparent">
          <p class="text-xs font-bold text-white truncate flex items-center gap-1.5">
            <span v-if="b.emoji" class="leading-none">{{ b.emoji }}</span>
            <BIcon v-else-if="b.icon" :name="b.icon" class="w-3 h-3 text-brand-accent/80 shrink-0" />
            {{ b.label }}
          </p>
          <p class="text-[10px] text-white/60">{{ b.urls.length }}</p>
        </div>
      </button>
    </div>
    <p v-else-if="!loadError" class="text-xs text-white/45">
      {{ canCreate ? 'Альбомов пока нет — создайте первый.' : 'Альбомов пока нет.' }}
    </p>
  </div>

  <Teleport to="body">
    <!-- Просмотр -->
    <div v-if="viewed && !(viewed.urls.length === 1 && !viewed.custom)" class="fixed inset-0 z-620 bg-black/70 backdrop-blur-xs flex items-center justify-center px-3" @click.self="closeViewer">
      <div class="w-full max-w-4xl max-h-[88vh] flex flex-col bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-brand-border shrink-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <span v-if="viewed.emoji" class="text-xl leading-none">{{ viewed.emoji }}</span>
            <BIcon v-else-if="viewed.icon" :name="viewed.icon" class="w-5 h-5 text-brand-accent shrink-0" />
            <h3 class="font-bold text-white text-base truncate">{{ viewed.label }}</h3>
            <span class="text-xs font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ viewed.urls.length }}</span>
          </div>
          <button type="button" @click="closeViewer" aria-label="Закрыть"
            class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>
        <div class="overflow-y-auto flex-1 p-3">
          <p v-if="viewed.description" class="text-sm text-white/70 whitespace-pre-wrap mb-2 px-1">{{ viewed.description }}</p>
          <p v-if="viewed.privacy" class="text-[11px] text-white/45 mb-3 px-1">Доступ: {{ privacyLabel(viewed.privacy) }}</p>
          <div v-if="viewed.urls.length" class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            <button v-for="(item, idx) in viewed.urls" :key="idx" type="button" @click="lightboxIndex = idx"
              class="relative aspect-square rounded-xl overflow-hidden cursor-zoom-in group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
              <img v-if="isImage(item.url)" :src="item.url" loading="lazy"
                :class="['w-full h-full object-cover group-hover:scale-105 transition-transform duration-300', item.is_nsfw && !nsfwMode ? 'blur-lg' : '']" />
              <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg/60">
                <BIcon name="Play" class="w-8 h-8 text-white/55" />
              </div>
              <span v-if="item.is_nsfw" class="absolute top-1 left-1 text-[9px] font-bold px-1 py-0.5 rounded-sm bg-rose-600/90 text-white leading-none">18+</span>
            </button>
          </div>
          <p v-else class="text-xs text-white/45 py-6 text-center">В альбоме пока ничего нет.</p>
        </div>
        <div v-if="viewed.custom?.can_edit" class="flex gap-2 px-5 py-3 border-t border-brand-border shrink-0">
          <button type="button" @click="startEdit(viewed.custom!)" class="px-4 py-2 rounded-xl bg-brand-accent text-white text-xs font-bold hover:brightness-110">Редактировать</button>
          <button type="button" @click="removeAlbum(viewed.custom!)" class="px-4 py-2 rounded-xl border border-rose-500/40 text-rose-400 text-xs font-bold hover:bg-rose-500/10">Удалить альбом</button>
        </div>
      </div>
    </div>

    <!-- Редактор -->
    <div v-if="editing" class="fixed inset-0 z-630 bg-black/70 backdrop-blur-xs flex items-center justify-center px-3" @click.self="closeEditor">
      <div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-brand-card border border-brand-border rounded-3xl shadow-2xl p-5">
        <div class="flex items-start justify-between gap-3 mb-4">
          <h3 class="text-base font-bold text-white min-w-0 truncate">{{ editing.album ? `Редактирование: ${editing.album.title}` : 'Новый альбом' }}</h3>
          <button type="button" @click="closeEditor" class="text-white/55 hover:text-white text-xl leading-none px-1" aria-label="Закрыть">×</button>
        </div>

        <label class="block text-[11px] font-bold text-white/55 mb-1">Название</label>
        <input v-model="form.title" maxlength="80" type="text"
          class="w-full px-3 py-2 mb-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-hidden focus:border-brand-accent/60" />

        <label class="block text-[11px] font-bold text-white/55 mb-1">Описание</label>
        <textarea v-model="form.description" maxlength="500" rows="3"
          class="w-full px-3 py-2 mb-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-hidden focus:border-brand-accent/60 resize-none" />

        <label class="block text-[11px] font-bold text-white/55 mb-1">Кто видит альбом</label>
        <select v-model="form.privacy"
          class="w-full px-3 py-2 mb-4 rounded-xl bg-brand-bg border border-white/10 text-sm text-white focus:outline-hidden focus:border-brand-accent/60">
          <option v-for="o in privacyOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <p class="text-[11px] font-bold text-white/55 mb-1">
          Файлы ({{ items.length }}){{ items.length > 1 ? ' — порядок меняется перетаскиванием' : '' }}
        </p>
        <StickerReorderGrid v-if="items.length" v-model:items="items" class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          <template #tile="{ item, index }">
            <div class="relative aspect-square rounded-xl overflow-hidden border border-brand-border bg-brand-bg cursor-grab active:cursor-grabbing">
              <img v-if="isImage(item.url)" :src="item.url" draggable="false" class="w-full h-full object-cover pointer-events-none" />
              <video v-else :src="item.url" muted playsinline class="w-full h-full object-cover pointer-events-none" />
              <span class="absolute bottom-1 left-1.5 text-[10px] font-bold text-white/80 bg-black/50 rounded-sm px-1 tabular-nums">{{ index + 1 }}</span>
              <button type="button" data-no-drag @click.stop="removeItem(item.url)" aria-label="Убрать"
                class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-rose-500/80 flex items-center justify-center text-white">
                <BIcon name="X" class="w-3.5 h-3.5" />
              </button>
            </div>
          </template>
          <template #ghost="{ item }">
            <img v-if="isImage(item.url)" :src="item.url" class="w-full h-full object-cover" />
            <video v-else :src="item.url" muted class="w-full h-full object-cover" />
          </template>
        </StickerReorderGrid>
        <MediaUpload folder="posts" accept="image/*,video/*" :multiple="true" :max-files="50" streaming @uploaded="onUploaded" />

        <p v-if="formError" class="text-xs text-brand-error mt-3">{{ formError }}</p>
        <div class="flex gap-2 mt-4">
          <button type="button" :disabled="saving" @click="save"
            class="px-4 py-2 rounded-xl bg-brand-accent text-white text-xs font-bold hover:brightness-110 disabled:opacity-50">
            {{ saving ? 'Сохранение…' : 'Сохранить' }}
          </button>
          <button type="button" @click="closeEditor"
            class="px-4 py-2 rounded-xl border border-brand-border text-white/70 text-xs font-bold hover:text-white">Отмена</button>
        </div>
      </div>
    </div>
  </Teleport>

  <MediaLightbox v-model:index="lightboxIndex" :urls="viewedUrls" />
</template>
