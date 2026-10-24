<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useGroupsStore } from '@/stores/groups'
import { useMobileHubStore } from '@/stores/mobileHub'
import { useTagSuggestions } from '@/composables/useTagSuggestions'
import { apiErrorMessage } from '@/lib/apiError'
import { extractHashtags, extractCommittedHashtags } from '@/lib/hashtags'
import { sanitizeTagInput } from '@/lib/tagRules'
import BIcon from '../BIcon.vue'
import MediaUpload from '../MediaUpload.vue'
import MentionTextarea from '../MentionTextarea.vue'
import PostScheduleMenu from '../PostScheduleMenu.vue'
import EntityAvatar from '../shared/EntityAvatar.vue'

type GroupEntity = { type: 'group'; id: string; slug: string; name: string; avatar_url: string | null }
type PostEntity = { type: 'user' } | GroupEntity
type Visibility = 'public' | 'subscriber_only'

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: string }[] = [
  { value: 'public', label: 'Видно всем', icon: 'Globe2' },
  { value: 'subscriber_only', label: 'Только Подписчикам', icon: 'Users' },
]

const emit = defineEmits<{ (e: 'published', post: any): void }>()

const auth = useAuthStore()
const langStore = useLangStore()
const groupsStore = useGroupsStore()
const mobileHub = useMobileHubStore()
const { suggestions: tagSuggestions, showSuggestions: showTagSuggestions, fetchSuggestions: fetchTagSuggestions, clearSuggestions: clearTagSuggestions } = useTagSuggestions()

const isOpen = ref(false)
const isPosting = ref(false)
const isScheduling = ref(false)
const showEntityPicker = ref(false)
const showVisibilityMenu = ref(false)
const showScheduleMenu = ref(false)
const mediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

// От чьего имени публикуем: от себя или от группы, которой управляем
const entity = ref<PostEntity>({ type: 'user' })
const managedGroups = computed(() => groupsStore.managedGroups)

const emptyDraft = () => ({ content: '', tags: [] as string[], isNsfw: false, isAiGenerated: false, visibility: 'public' as Visibility })
const draft = reactive(emptyDraft())
const tagInput = ref('')
const mediaUrls = ref<string[]>([])
const mediaOriginalUrls = ref<string[]>([])
const handleMediaUploaded = (urls: string[], originalUrls: string[]) => { mediaUrls.value = urls; mediaOriginalUrls.value = originalUrls }

const hasContent = computed(() => !!draft.content.trim() || mediaUrls.value.length > 0)
const author = computed(() => entity.value.type === 'group'
  ? { name: entity.value.name, avatar: entity.value.avatar_url, square: true }
  : { name: auth.user?.display_name || auth.user?.username || '', avatar: auth.avatarUrl, square: false })
const visibilityOption = computed(() => VISIBILITY_OPTIONS.find((o) => o.value === draft.visibility) ?? VISIBILITY_OPTIONS[0])

// ── Тосты ────────────────────────────────────────────────────────────────────
const toast = ref<{ text: string; error: boolean } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function notify(text: string, error = false) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { text, error }
  toastTimer = setTimeout(() => { toast.value = null; toastTimer = null }, error ? 3500 : 1800)
}
onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

// ── Теги ─────────────────────────────────────────────────────────────────────
const addTags = (names: string[]) => {
  for (const name of names) if (name && !draft.tags.includes(name)) draft.tags.push(name)
}
// «#хештеги» из текста подхватываем, когда слово дописано (не на каждой букве)
watch(() => draft.content, (content) => addTags(extractCommittedHashtags(content)))
const addTag = () => {
  addTags([sanitizeTagInput(tagInput.value.replace(/^\s*#/, ''))])
  tagInput.value = ''
  clearTagSuggestions()
}
const addTagFromSuggestion = (name: string) => {
  addTags([sanitizeTagInput(name)])
  tagInput.value = ''
  clearTagSuggestions()
}
const removeTag = (tag: string) => { draft.tags = draft.tags.filter((t) => t !== tag) }

// ── Открытие / закрытие ──────────────────────────────────────────────────────
function open() { isOpen.value = true }
function resetAndClose() {
  isOpen.value = false
  showEntityPicker.value = false
  showVisibilityMenu.value = false
  showScheduleMenu.value = false
  Object.assign(draft, emptyDraft())
  tagInput.value = ''
  mediaUrls.value = []
  mediaOriginalUrls.value = []
  mediaUploadRef.value?.clearAll()
}

// Кнопка «+» в нижней навигации телефона открывает форму
watch(() => mobileHub.openPostForm, (requested) => { if (requested) { open(); mobileHub.consumePost() } })
defineExpose({ open })

// ── Перетаскивание файлов в форму ────────────────────────────────────────────
const isDragging = ref(false)
let dragDepth = 0
const dragHasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
function onDragEnter(e: DragEvent) {
  if (!dragHasFiles(e)) return
  dragDepth++
  isDragging.value = true
  open()
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) isDragging.value = false
}
function onDrop(e: DragEvent) {
  dragDepth = 0
  isDragging.value = false
  e.preventDefault()
  if (e.dataTransfer?.files?.length) mediaUploadRef.value?.processFiles(e.dataTransfer.files)
}
watch(isOpen, (value) => { if (!value) { dragDepth = 0; isDragging.value = false } })

// ── Отправка ─────────────────────────────────────────────────────────────────
/** Общая часть тела запроса для публикации, отложенного поста и черновика. */
function payload() {
  const content = draft.content.trim()
  // Последний «#тег» без пробела после него мог не успеть попасть в draft.tags
  addTags(extractHashtags(content))
  return {
    content,
    tags: draft.tags,
    isNsfw: draft.isNsfw,
    isAiGenerated: draft.isAiGenerated,
    mediaUrls: mediaUrls.value,
    mediaOriginalUrls: mediaOriginalUrls.value,
  }
}
const groupIdOrUndefined = () => (entity.value.type === 'group' ? entity.value.id : undefined)

async function publish() {
  if (!hasContent.value || isPosting.value) return
  isPosting.value = true
  const target = entity.value
  try {
    let post: any = null
    if (target.type === 'group') {
      post = await groupsStore.createGroupPost(target.id, payload())
      // Ответ создания не содержит группу — подкладываем её, чтобы карточка показала сообщество, а не автора
      if (post) post.groupPosts = [{ group: { id: target.id, slug: target.slug, name: target.name, avatar_url: target.avatar_url } }]
    } else {
      const res = await api.post('/posts', { ...payload(), subscriberOnly: draft.visibility === 'subscriber_only' })
      if (res.data.success) post = res.data.data?.post
    }
    if (post) emit('published', post)
    resetAndClose()
    notify(target.type === 'group' ? `Пост опубликован от имени «${target.name}»` : 'Пост опубликован')
  } catch (e) {
    notify(apiErrorMessage(e) ?? 'Не удалось опубликовать пост', true)
  } finally {
    isPosting.value = false
  }
}

async function saveScheduled(schedule: { scheduledAt?: string; timezone?: string }) {
  if (!hasContent.value || isScheduling.value) return
  isScheduling.value = true
  try {
    const res = await api.post('/posts/scheduled', { ...payload(), groupId: groupIdOrUndefined(), ...schedule })
    if (res.data.success) {
      resetAndClose()
      notify(schedule.scheduledAt ? 'Публикация запланирована' : 'Сохранено в черновики')
    }
  } catch (e) {
    notify(apiErrorMessage(e) ?? 'Не удалось сохранить пост', true)
  } finally {
    isScheduling.value = false
  }
}

// Закрытие формы с неотправленным текстом/медиа не должно его выбрасывать: сохраняем в черновики
// (как явное «Сохранить в черновики»). После успешной публикации форма уже пуста, сюда не попадаем.
async function cancel() {
  if (!hasContent.value) return resetAndClose()
  try {
    await api.post('/posts/scheduled', { ...payload(), groupId: groupIdOrUndefined() })
    notify('Незаконченный пост сохранён в черновики')
  } catch (e) {
    notify(apiErrorMessage(e) ?? 'Не удалось сохранить черновик', true)
  } finally {
    resetAndClose()
  }
}

const pickEntity = (next: PostEntity) => { entity.value = next; showEntityPicker.value = false }
const pickVisibility = (value: Visibility) => { draft.visibility = value; showVisibilityMenu.value = false }
</script>

<template>
  <div
    class="panel-card"
    :data-active="isOpen"
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @dragover.prevent
    @drop="onDrop"
  >
    <!-- Тост результата -->
    <Transition name="pill">
      <div
        v-if="toast"
        role="status"
        class="floating-pill top-20 z-500 pointer-events-none"
        :class="toast.error ? 'bg-brand-error' : 'bg-brand-success'"
      >{{ toast.text }}</div>
    </Transition>

    <!-- Свёрнутая форма -->
    <button v-if="!isOpen" type="button" class="w-full flex items-center gap-3 px-5 py-4 max-md:px-4 max-md:py-3 text-left group" @click="open">
      <EntityAvatar
        :src="author.avatar"
        :name="author.name"
        :square="author.square"
        class="w-10 h-10 border-2 border-brand-border group-hover:border-brand-accent/50 transition-colors"
      />
      <span class="flex-1 flex items-center justify-between gap-2 min-w-0 text-sm text-white/55 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">
        <span class="truncate">{{ entity.type === 'group' ? `${entity.name}…` : langStore.t.whatsNew }}</span>
        <span class="flex items-center gap-2 text-white/35 group-hover:text-white/60 transition-colors shrink-0">
          <BIcon name="ImagePlus" class="w-4 h-4" />
          <BIcon name="Hash" class="w-4 h-4" />
        </span>
      </span>
    </button>

    <!-- Развёрнутая форма -->
    <div v-else class="p-5 max-md:p-4 stack-y-4" @keydown.ctrl.enter.prevent="publish" @keydown.meta.enter.prevent="publish">
      <div class="flex items-start gap-3 max-md:flex-wrap max-md:items-center max-md:gap-2">
        <!-- Аватар автора; если есть управляемые группы — выбор «от чьего имени» -->
        <div class="relative shrink-0 mt-0.5">
          <component
            :is="managedGroups.length ? 'button' : 'div'"
            :type="managedGroups.length ? 'button' : undefined"
            class="flex items-center gap-1 group/av focus:outline-hidden"
            @click.stop="managedGroups.length && (showEntityPicker = !showEntityPicker)"
          >
            <EntityAvatar
              :src="author.avatar"
              :name="author.name"
              :square="author.square"
              class="w-10 h-10 border-2 transition-colors"
              :class="showEntityPicker ? 'border-brand-accent' : 'border-brand-border group-hover/av:border-brand-accent/60'"
            />
            <BIcon
              v-if="managedGroups.length"
              name="ChevronDown"
              class="w-3.5 h-3.5 text-white/50 group-hover/av:text-white/80 transition-all"
              :class="showEntityPicker ? 'rotate-180 text-brand-accent' : ''"
            />
          </component>

          <Transition name="slide">
            <div v-if="showEntityPicker" v-click-outside="() => (showEntityPicker = false)" class="popover-panel absolute top-full left-0 mt-2 z-30 min-w-[220px] py-1.5">
              <button type="button" class="menu-item" :data-active="entity.type === 'user'" @click="pickEntity({ type: 'user' })">
                <EntityAvatar :src="auth.avatarUrl" :name="auth.user?.display_name || auth.user?.username" class="w-7 h-7 text-sm" />
                <span class="font-semibold truncate flex-1">{{ auth.user?.display_name || auth.user?.username }}</span>
                <BIcon v-if="entity.type === 'user'" name="Check" class="w-3.5 h-3.5 shrink-0" />
              </button>
              <div class="h-px bg-brand-border mx-3 my-1" />
              <button
                v-for="group in managedGroups"
                :key="group.id"
                type="button"
                class="menu-item"
                :data-active="entity.type === 'group' && entity.id === group.id"
                @click="pickEntity({ type: 'group', id: group.id, slug: group.slug, name: group.name, avatar_url: group.avatar_url })"
              >
                <EntityAvatar :src="group.avatar_url" :name="group.name" square class="w-7 h-7 text-sm" />
                <span class="font-semibold truncate flex-1">{{ group.name }}</span>
                <span class="text-[9px] text-brand-accent/70 bg-brand-accent/10 border border-brand-accent/25 px-1.5 py-0.5 rounded-sm font-bold uppercase shrink-0">{{ langStore.t.groups }}</span>
                <BIcon v-if="entity.type === 'group' && entity.id === group.id" name="Check" class="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </Transition>
        </div>

        <div class="flex-1 min-w-0 max-md:order-last max-md:basis-full">
          <MentionTextarea v-model="draft.content" placeholder="Что у вас нового? Используйте @ для упоминаний" minHeight="90px" />
        </div>

        <!-- Отложить -->
        <div class="relative shrink-0 mt-0.5 max-md:mt-0 max-md:ml-auto">
          <button
            type="button"
            class="icon-btn"
            title="Отложить публикацию"
            aria-label="Отложить публикацию"
            :disabled="!hasContent || isScheduling"
            @click.stop="showScheduleMenu = !showScheduleMenu"
          >
            <BIcon :name="isScheduling ? 'Loader2' : 'CalendarClock'" class="w-4.5 h-4.5" :class="{ 'animate-spin': isScheduling }" />
          </button>
          <PostScheduleMenu v-if="showScheduleMenu" @close="showScheduleMenu = false" @draft="saveScheduled({})" @schedule="saveScheduled" />
        </div>

        <!-- Опубликовать -->
        <button
          type="button"
          class="icon-btn icon-btn-primary mt-0.5 max-md:mt-0"
          title="Опубликовать (Ctrl+Enter)"
          aria-label="Опубликовать"
          :disabled="!hasContent || isPosting"
          @click="publish"
        >
          <BIcon :name="isPosting ? 'Loader2' : 'SendHorizontal'" class="w-5 h-5" :class="{ 'animate-spin': isPosting }" />
        </button>
      </div>

      <MediaUpload documents ref="mediaUploadRef" type="posts" :multiple="true" :max-files="20" @uploaded="handleMediaUploaded" />

      <div v-if="isDragging" class="flex items-center gap-2 rounded-2xl border border-dashed border-brand-accent/60 bg-brand-accent/8 px-4 py-3 text-xs text-brand-accent font-semibold">
        <BIcon name="UploadCloud" class="w-4 h-4" />
        Отпустите файл, чтобы прикрепить к посту
      </div>

      <div v-if="draft.tags.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="tag in draft.tags"
          :key="tag"
          type="button"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-xs font-semibold hover:bg-brand-accent/25 transition-colors"
          :aria-label="`Убрать тег ${tag}`"
          @click="removeTag(tag)"
        >
          #{{ tag }}
          <BIcon name="X" class="w-3 h-3 text-brand-accent/60" />
        </button>
      </div>

      <div class="border-t border-brand-border" />

      <!-- Панель инструментов -->
      <div class="flex items-center gap-2 flex-wrap">
        <button type="button" class="toolbar-btn" title="Прикрепить медиа" @click="mediaUploadRef?.openPicker()">
          <BIcon name="ImagePlus" class="w-4 h-4" />
          Медиа
        </button>

        <div class="toolbar-btn relative gap-1">
          <BIcon name="Hash" class="w-4 h-4 shrink-0" />
          <input
            v-model="tagInput"
            type="text"
            placeholder="тег + Enter"
            aria-label="Добавить тег"
            class="bg-transparent text-xs text-white placeholder-brand-muted outline-hidden w-24"
            @input="fetchTagSuggestions(tagInput)"
            @keydown.enter.prevent="addTag"
            @keydown.escape="clearTagSuggestions"
          />
          <div v-if="showTagSuggestions" v-click-outside="clearTagSuggestions" class="popover-panel absolute top-full left-0 mt-1.5 z-30 w-56">
            <button v-for="s in tagSuggestions" :key="s.name" type="button" class="menu-item justify-between px-4 py-2" @click="addTagFromSuggestion(s.name)">
              <span class="truncate">#{{ s.name }}</span>
              <span class="text-xs text-white/35 shrink-0">{{ s.count }}</span>
            </button>
          </div>
        </div>

        <button type="button" class="toolbar-btn" data-tone="error" :data-active="draft.isNsfw" @click="draft.isNsfw = !draft.isNsfw">NSFW</button>
        <button type="button" class="toolbar-btn" data-tone="purple" :data-active="draft.isAiGenerated" :title="langStore.t.aiGenToggleTitle" @click="draft.isAiGenerated = !draft.isAiGenerated">
          <BIcon name="Bot" class="w-3.5 h-3.5" /> {{ langStore.t.aiGenBadge }}
        </button>
      </div>

      <!-- Кому виден пост + отмена (отдельная строка, чтобы «Отмена» не оказывалась одна на новой) -->
      <div class="flex items-center justify-between gap-2 mt-2">
        <div class="relative">
          <button type="button" class="toolbar-btn font-semibold" :data-active="draft.visibility !== 'public'" @click.stop="showVisibilityMenu = !showVisibilityMenu">
            <BIcon :name="visibilityOption.icon" class="w-3.5 h-3.5" />
            {{ visibilityOption.label }}
            <BIcon name="ChevronDown" class="w-3 h-3 opacity-60" />
          </button>
          <Transition name="slide">
            <div v-if="showVisibilityMenu" v-click-outside="() => (showVisibilityMenu = false)" class="popover-panel absolute bottom-full left-0 mb-1.5 z-30 w-52">
              <button
                v-for="option in VISIBILITY_OPTIONS"
                :key="option.value"
                type="button"
                class="menu-item px-4"
                :data-active="draft.visibility === option.value"
                @click="pickVisibility(option.value)"
              >
                <BIcon :name="option.icon" class="w-4 h-4 shrink-0" />
                {{ option.label }}
                <BIcon v-if="draft.visibility === option.value" name="Check" class="w-3.5 h-3.5 ml-auto" />
              </button>
              <button type="button" class="menu-item px-4" disabled title="Скоро будет доступно">
                <BIcon name="DollarSign" class="w-4 h-4 shrink-0" />
                Платный пост
                <span class="ml-auto text-[10px] uppercase tracking-wide">скоро</span>
              </button>
            </div>
          </Transition>
        </div>

        <button type="button" class="text-xs font-semibold text-white/55 hover:text-white transition-colors" @click="cancel">Отмена</button>
      </div>
    </div>
  </div>
</template>
