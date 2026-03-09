<template>
  <div class="flex flex-col h-full bg-brand-card w-full overflow-hidden">
    <!-- Header -->
    <div v-if="!hideHeader" class="flex items-center justify-between px-4 py-3 border-b border-brand-border flex-shrink-0">
      <h2 class="font-bold text-white text-base">Сообщения</h2>
      <div class="flex items-center gap-1">
        <button @click="showCreateGroup = true"
          class="p-1.5 rounded-xl hover:bg-brand-bg transition-colors text-white/55 hover:text-brand-accent"
          title="Создать группу">
          <BIcon name="Users" class="w-4 h-4" />
        </button>
        <button @click="$emit('new-conversation')"
          class="p-1.5 rounded-xl hover:bg-brand-bg transition-colors text-white/55 hover:text-brand-accent"
          title="Новый диалог">
          <BIcon name="SquarePen" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="px-3 pt-2 pb-0 flex-shrink-0">
      <div class="flex items-center gap-2 bg-brand-bg rounded-2xl px-3 py-2 border border-brand-border focus-within:border-brand-accent/50 transition-colors">
        <BIcon name="Search" class="w-3.5 h-3.5 text-white/55 flex-shrink-0" />
        <input v-model="search" type="text" placeholder="Поиск диалога..."
          class="bg-transparent text-sm text-white placeholder-brand-muted outline-none w-full" />
        <button v-if="search" @click="search = ''" class="text-white/55 hover:text-white transition-colors">
          <BIcon name="X" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Category tabs -->
    <div class="flex items-center gap-1 px-3 pt-2 pb-2 flex-shrink-0 border-b border-brand-border overflow-x-auto hide-scrollbar">
      <button v-for="cat in CATEGORIES" :key="cat.id" @click="activeCategory = cat.id"
        :class="['flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
          activeCategory === cat.id ? 'bg-brand-accent text-white shadow-sm shadow-brand-accent/20' : 'text-white/55 hover:text-white hover:bg-brand-bg']">
        <BIcon :name="cat.icon" class="w-3 h-3" />
        {{ cat.label }}
        <span v-if="cat.id !== 'all'" class="opacity-60 text-[10px]">({{ getCategoryCount(cat.id) }})</span>
      </button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto min-h-0" @click="menuConvId = null">
      <template v-if="store.loading">
        <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-3 py-3">
          <div class="w-10 h-10 rounded-full bg-brand-border animate-pulse flex-shrink-0" />
          <div class="flex-1 space-y-2">
            <div class="h-3 bg-brand-border rounded-full animate-pulse w-28" />
            <div class="h-2.5 bg-brand-border rounded-full animate-pulse w-40" />
          </div>
        </div>
      </template>
      <div v-else-if="!filtered.length" class="flex flex-col items-center justify-center h-40 text-white/55 text-sm gap-2">
        <BIcon name="MessageCircle" class="w-8 h-8 opacity-40" />
        <span>{{ search ? 'Ничего не найдено' : 'Нет диалогов' }}</span>
      </div>
      <button v-for="conv in filtered" :key="conv.id"
        :class="['w-full flex items-center gap-3 px-3 py-3 transition-all text-left border-b border-brand-border/30 last:border-0 relative group/conv',
          activeId === conv.id ? 'bg-brand-accent/12 border-l-2 border-l-brand-accent pl-2' : 'hover:bg-brand-bg/60 border-l-2 border-l-transparent']"
        @click="$emit('select', conv.id)">
        <!-- Customer badge -->
        <div v-if="conv.my_participant?.label === 'customer'"
          class="absolute top-2 right-24 flex items-center gap-0.5 bg-brand-accent/15 border border-brand-accent/30 rounded-full px-1.5 py-0.5 pointer-events-none">
          <BIcon name="Briefcase" class="w-2.5 h-2.5 text-brand-accent" />
          <span class="text-[9px] font-bold text-brand-accent">заказ</span>
        </div>
        <!-- Avatar -->
        <div class="relative flex-shrink-0">
          <!-- Group: 2x2 grid or custom avatar -->
          <template v-if="conv.is_group">
            <img v-if="conv.avatar_url" :src="conv.avatar_url" :alt="conv.name ?? 'Группа'"
              class="w-10 h-10 rounded-full object-cover border border-brand-border" />
            <div v-else class="grid grid-cols-2 gap-px w-10 h-10 rounded-full overflow-hidden border border-brand-border bg-brand-bg">
              <template v-for="(p, idx) in conv.other_participants.slice(0, 4)" :key="p.user_id">
                <img v-if="p.user?.avatar_url" :src="p.user.avatar_url" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center bg-brand-accent/20 text-brand-accent text-[8px] font-bold">
                  {{ (p.user?.display_name || p.user?.username || '?')[0].toUpperCase() }}
                </div>
              </template>
              <div v-for="i in Math.max(0, 4 - conv.other_participants.length)" :key="`e${i}`" class="w-full h-full bg-brand-border/30" />
            </div>
          </template>
          <!-- DM / Notes -->
          <template v-else>
            <!-- Notes: self-DM (no other participants) -->
            <template v-if="isNotes(conv)">
              <div class="w-10 h-10 rounded-full bg-brand-accent/15 border border-brand-accent/30 flex items-center justify-center">
                <BIcon name="StickyNote" class="w-5 h-5 text-brand-accent" />
              </div>
            </template>
            <template v-else>
              <img v-if="getOther(conv)?.avatar_url" :src="getOther(conv)!.avatar_url!" :alt="getOther(conv)?.username"
                class="w-10 h-10 rounded-full object-cover border border-brand-border" />
              <div v-else class="w-10 h-10 rounded-full bg-brand-accent/20 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-sm">
                {{ (getOther(conv)?.display_name || getOther(conv)?.username || '?')[0].toUpperCase() }}
              </div>
            </template>
          </template>
          <span v-if="isUnread(conv)" class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-brand-accent rounded-full border-2 border-brand-card" />
        </div>
        <!-- Text -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span :class="['font-semibold text-sm truncate', isUnread(conv) ? 'text-white' : 'text-brand-offwhite/80']">
                  {{ conv.is_group ? (conv.name || 'Группа') : isNotes(conv) ? '📝 Мои заметки' : (getOther(conv)?.display_name || getOther(conv)?.username || 'Неизвестный') }}
              </span>
              <BIcon v-if="conv.is_group" name="Users" class="w-3 h-3 text-white/55 flex-shrink-0" />
            </div>
            <span class="text-[10px] text-white/55 flex-shrink-0">{{ formatTime(conv.last_message?.created_at || conv.updated_at) }}</span>
          </div>
          <p :class="['text-xs truncate mt-0.5', isUnread(conv) ? 'text-brand-offwhite/70' : 'text-white/55']">
            <template v-if="conv.is_group && conv.last_message">
              <span class="text-brand-accent/80">{{ conv.last_message.sender?.display_name || conv.last_message.sender?.username }}: </span>
            </template>
            {{ previewText(conv.last_message?.text) || (conv.last_message?.file_url ? '📎 Медиафайл' : 'Нет сообщений') }}
          </p>
        </div>
        <!-- Context menu trigger -->
        <div class="relative flex-shrink-0 opacity-0 group-hover/conv:opacity-100 transition-opacity" @click.stop>
          <button @click.stop="menuConvId = menuConvId === conv.id ? null : conv.id"
            class="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
            <BIcon name="MoreVertical" class="w-3.5 h-3.5" />
          </button>
          <!-- Dropdown -->
          <div v-if="menuConvId === conv.id"
            class="absolute right-0 top-8 z-50 bg-brand-card border border-brand-border rounded-2xl shadow-2xl py-1 w-44"
            @click.stop>
            <button
              @click.stop="setLabel(conv, conv.my_participant?.label === 'customer' ? 'default' : 'customer')"
              class="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-brand-bg transition-colors text-left"
              :class="conv.my_participant?.label === 'customer' ? 'text-brand-accent' : 'text-white/80'">
              <BIcon :name="conv.my_participant?.label === 'customer' ? 'BriefcaseOff' : 'Briefcase'" class="w-4 h-4" />
              {{ conv.my_participant?.label === 'customer' ? 'Убрать метку' : 'Пометить как заказ' }}
            </button>
            <button
              @click.stop="toggleArchive(conv); menuConvId = null"
              class="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-brand-bg transition-colors text-left text-white/80">
              <BIcon :name="conv.my_participant?.archived ? 'ArchiveX' : 'Archive'" class="w-4 h-4" />
              {{ conv.my_participant?.archived ? 'Разархивировать' : 'Архивировать' }}
            </button>
          </div>
        </div>
      </button>
    </div>

    <!-- Notes + Archive bar -->
    <div class="flex-shrink-0 border-t border-brand-border px-2 py-1.5 flex items-center gap-1">
      <button @click="openNotes"
        class="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-brand-bg transition-colors group">
        <div class="w-7 h-7 rounded-full bg-brand-accent/15 flex items-center justify-center flex-shrink-0">
          <BIcon name="StickyNote" class="w-3.5 h-3.5 text-brand-accent" />
        </div>
        <span class="text-sm text-brand-offwhite/80 group-hover:text-white transition-colors truncate">Мои заметки</span>
      </button>
      <button @click="$emit('new-conversation')"
        class="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-colors"
        title="Новая беседа">
        <BIcon name="Plus" class="w-4 h-4" />
      </button>
      <button @click="showArchived = !showArchived"
        :class="['flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-brand-bg transition-colors group', showArchived ? 'bg-brand-bg' : '']">
        <BIcon name="Archive" :class="['w-4 h-4 transition-colors', showArchived ? 'text-brand-accent' : 'text-white/55 group-hover:text-white']" />
        <span :class="['text-sm transition-colors', showArchived ? 'text-brand-accent' : 'text-white/55 group-hover:text-white']">Архив</span>
        <span v-if="archivedCount" class="ml-0.5 text-[10px] bg-brand-accent/20 text-brand-accent rounded-full px-1.5 py-0.5 font-semibold">{{ archivedCount }}</span>
      </button>
    </div>

    <!-- Create Group Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showCreateGroup" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="closeCreateGroup">
          <div class="bg-brand-card border border-brand-border rounded-2xl shadow-2xl w-full max-w-sm flex flex-col" style="max-height:92vh">

            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border flex-shrink-0">
              <div class="flex items-center gap-2.5">
                <!-- Step dots -->
                <div class="flex items-center gap-1">
                  <span v-for="s in 2" :key="s"
                    :class="['w-5 h-1.5 rounded-full transition-all', s === createStep ? 'bg-brand-accent w-8' : 'bg-brand-border']" />
                </div>
                <h3 class="text-sm font-semibold text-white">{{ createStep === 1 ? 'Настройка беседы' : 'Добавить участников' }}</h3>
              </div>
              <button @click="closeCreateGroup" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <!-- ── Step 1: Name + Avatar + Banner ── -->
            <div v-if="createStep === 1" class="flex-1 overflow-y-auto min-h-0">
              <!-- Banner preview area -->
              <div
                class="relative w-full h-28 bg-gradient-to-br from-brand-accent/20 to-purple-900/40 overflow-hidden cursor-pointer group"
                @click="cgBannerRef?.click()">
                <img v-if="cgBanner" :src="cgBanner" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex flex-col items-center justify-center gap-1 text-white/30 group-hover:text-white/50 transition-colors">
                  <BIcon name="Image" class="w-6 h-6" />
                  <span class="text-xs">Нажмите, чтобы добавить баннер</span>
                </div>
                <div v-if="cgBanner" class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span class="text-xs text-white bg-black/50 px-2 py-1 rounded-lg">Изменить баннер</span>
                </div>
                <span v-if="uploadingCgBanner" class="absolute inset-0 flex items-center justify-center">
                  <span class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                </span>
              </div>
              <input ref="cgBannerRef" type="file" accept="image/*" class="sr-only" @change="onCgBannerChange" />
              <input ref="cgAvatarRef" type="file" accept="image/*" class="sr-only" @change="onCgAvatarChange" />

              <!-- Avatar overlapping the banner -->
              <div class="px-4 pb-4">
                <div class="flex items-end gap-3 -mt-7 mb-4">
                  <div
                    class="w-14 h-14 rounded-2xl border-2 border-brand-card bg-brand-bg overflow-hidden cursor-pointer flex-shrink-0 relative group shadow-lg"
                    @click="cgAvatarRef?.click()">
                    <img v-if="cgAvatar" :src="cgAvatar" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full flex items-center justify-center">
                      <BIcon name="Camera" class="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                    </div>
                    <span v-if="uploadingCgAvatar" class="absolute inset-0 flex items-center justify-center bg-black/50">
                      <span class="w-4 h-4 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                    </span>
                  </div>
                  <div class="flex-1 min-w-0 mb-1">
                    <p class="text-xs text-white/40">{{ cgAvatar ? 'Аватар установлен' : 'Добавить аватар беседы' }}</p>
                    <div class="flex items-center gap-2 mt-0.5">
                      <button v-if="cgAvatar" type="button" @click="cgAvatar = ''" class="text-[10px] text-brand-error hover:underline">Удалить</button>
                      <button v-if="cgBanner" type="button" @click="cgBanner = ''" class="text-[10px] text-white/40 hover:text-white/60 hover:underline">Убрать баннер</button>
                    </div>
                  </div>
                </div>

                <!-- Name field -->
                <div>
                  <label class="block text-xs text-white/55 mb-1.5 font-medium">Название беседы <span class="text-brand-accent">*</span></label>
                  <input v-model="groupName" type="text" maxlength="100" placeholder="Введите название..."
                    class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent/60 transition-colors" />
                </div>
              </div>
            </div>

            <!-- ── Step 2: Participants ── -->
            <div v-else class="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              <div>
                <label class="block text-xs text-white/55 mb-1.5 font-medium">Добавить участников <span class="text-white/30">(минимум 2)</span></label>
                <div class="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 focus-within:border-brand-accent/60 transition-colors">
                  <BIcon name="Search" class="w-3.5 h-3.5 text-white/55 flex-shrink-0" />
                  <input v-model="userSearch" type="text" placeholder="Поиск по имени или @нику..."
                    class="bg-transparent text-sm text-white placeholder-brand-muted outline-none w-full" @input="searchUsers" />
                </div>
                <div v-if="searchResults.length" class="mt-2 border border-brand-border rounded-xl overflow-hidden">
                  <button v-for="u in searchResults" :key="u.id" @click="toggleUser(u)"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-brand-bg transition-colors text-left border-b border-brand-border/50 last:border-0">
                    <img v-if="u.avatar_url" :src="u.avatar_url" class="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    <div v-else class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
                      {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-white font-medium truncate">{{ u.display_name || u.username }}</p>
                      <p class="text-xs text-white/55 truncate">@{{ u.username }}</p>
                    </div>
                    <div :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                      isSelected(u.id) ? 'bg-brand-accent border-brand-accent' : 'border-brand-border']">
                      <BIcon v-if="isSelected(u.id)" name="Check" class="w-3 h-3 text-white" />
                    </div>
                  </button>
                </div>
              </div>
              <div v-if="selectedUsers.length">
                <p class="text-xs text-white/55 mb-2 font-medium">Выбрано: {{ selectedUsers.length }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <div v-for="u in selectedUsers" :key="u.id"
                    class="flex items-center gap-1.5 bg-brand-accent/15 border border-brand-accent/30 rounded-full pl-1 pr-2 py-0.5">
                    <img v-if="u.avatar_url" :src="u.avatar_url" class="w-5 h-5 rounded-full object-cover" />
                    <div v-else class="w-5 h-5 rounded-full bg-brand-accent/30 flex items-center justify-center text-brand-accent text-[10px] font-bold">
                      {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
                    </div>
                    <span class="text-xs text-white">{{ u.display_name || u.username }}</span>
                    <button @click="removeUser(u.id)" class="text-brand-accent/60 hover:text-brand-error transition-colors ml-0.5">
                      <BIcon name="X" class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="flex items-center gap-2 px-4 py-3 border-t border-brand-border flex-shrink-0">
              <button
                v-if="createStep === 1"
                @click="closeCreateGroup"
                class="flex-1 py-2 rounded-xl border border-brand-border text-sm text-white/55 hover:text-white hover:bg-brand-bg/50 transition-colors">
                Отмена
              </button>
              <button
                v-else
                @click="createStep = 1"
                class="flex-1 py-2 rounded-xl border border-brand-border text-sm text-white/55 hover:text-white hover:bg-brand-bg/50 transition-colors flex items-center justify-center gap-1">
                <BIcon name="ChevronLeft" class="w-3.5 h-3.5" />
                Назад
              </button>

              <button
                v-if="createStep === 1"
                @click="createStep = 2"
                :disabled="!groupName.trim()"
                class="flex-1 py-2 rounded-xl bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1">
                Далее
                <BIcon name="ChevronRight" class="w-3.5 h-3.5" />
              </button>
              <button
                v-else
                @click="createGroup"
                :disabled="!canCreate || creating"
                class="flex-1 py-2 rounded-xl bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                <BIcon v-if="creating" name="Loader2" class="w-3.5 h-3.5 animate-spin" />
                {{ creating ? 'Создание...' : 'Создать беседу' }}
              </button>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessagesStore, type Conversation, type MsgSender } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import BIcon from '@/components/BIcon.vue'
import api from '@/api'

const props = defineProps<{
  activeId: string | null
  hideHeader?: boolean
}>()
const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'new-conversation'): void
}>()

const store = useMessagesStore()
const auth  = useAuthStore()
const search = ref('')
const activeCategory = ref<'all' | 'personal' | 'groups' | 'customer'>('all')
const showArchived = ref(false)
// Context menu for labeling
const menuConvId = ref<string | null>(null)

// ── Notes (DM with self) ──────────────────────────────────────────────────
async function openNotes() {
  if (!auth.user) return
  try {
    const convId = await store.openConversation(auth.user.id)
    emit('select', convId)
  } catch { /* silent */ }
}

const archivedCount = computed(() => store.conversations.filter((c) => c.my_participant?.archived).length)

// ── Create group ─────────────────────────────────────────────────────────
const showCreateGroup = ref(false)
const createStep = ref(1)
const groupName = ref('')
const cgAvatar = ref('')
const cgBanner = ref('')
const cgAvatarRef = ref<HTMLInputElement | null>(null)
const cgBannerRef = ref<HTMLInputElement | null>(null)
const uploadingCgAvatar = ref(false)
const uploadingCgBanner = ref(false)
const userSearch = ref('')
const searchResults = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])
const selectedUsers = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])
const creating = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

function closeCreateGroup() {
  showCreateGroup.value = false
  createStep.value = 1
  groupName.value = ''
  cgAvatar.value = ''
  cgBanner.value = ''
  userSearch.value = ''
  searchResults.value = []
  selectedUsers.value = []
}

async function onCgAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingCgAvatar.value = true
  try {
    const fd = new FormData()
    fd.append('file', file, file.name)
    const res = await api.post('/media/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    cgAvatar.value = res.data.data.url
  } catch { /* silent */ }
  finally { uploadingCgAvatar.value = false; if (cgAvatarRef.value) cgAvatarRef.value.value = '' }
}

async function onCgBannerChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingCgBanner.value = true
  try {
    const fd = new FormData()
    fd.append('file', file, file.name)
    const res = await api.post('/media/upload?folder=banners', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    cgBanner.value = res.data.data.url
  } catch { /* silent */ }
  finally { uploadingCgBanner.value = false; if (cgBannerRef.value) cgBannerRef.value.value = '' }
}

async function searchUsers() {
  const q = userSearch.value.trim()
  if (q.length < 1) { searchResults.value = []; return }
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(q)}&limit=8`)
      const all = res.data?.data?.users ?? res.data?.data ?? []
      searchResults.value = all.filter((u: any) => u.id !== auth.user?.id)
    } catch { searchResults.value = [] }
  }, 300)
}

function isSelected(userId: string) { return selectedUsers.value.some((u) => u.id === userId) }
function toggleUser(u: typeof searchResults.value[0]) {
  isSelected(u.id) ? removeUser(u.id) : selectedUsers.value.push(u)
}
function removeUser(userId: string) {
  selectedUsers.value = selectedUsers.value.filter((u) => u.id !== userId)
}
const canCreate = computed(() => groupName.value.trim().length > 0 && selectedUsers.value.length >= 2)

async function createGroup() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    const convId = await store.createGroup(
      groupName.value,
      selectedUsers.value.map((u) => u.id),
      { avatar_url: cgAvatar.value || undefined, banner_url: cgBanner.value || undefined },
    )
    emit('select', convId)
    closeCreateGroup()
  } catch { /* silent */ }
  finally { creating.value = false }
}

// ── Filters ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all'      as const, label: 'Все',    icon: 'MessagesSquare' },
  { id: 'personal' as const, label: 'Личные', icon: 'User' },
  { id: 'groups'   as const, label: 'Группы', icon: 'Users' },
  { id: 'customer' as const, label: 'Заказы', icon: 'Briefcase' },
]

function getCategoryCount(cat: 'personal' | 'groups' | 'customer'): number {
  const active = store.conversations.filter((c) => !c.my_participant?.archived)
  if (cat === 'personal') return active.filter((c) => !c.is_group).length
  if (cat === 'groups')   return active.filter((c) =>  c.is_group).length
  if (cat === 'customer') return active.filter((c) => c.my_participant?.label === 'customer').length
  return 0
}

const filtered = computed(() => {
  let list = store.conversations
  if (!showArchived.value) {
    list = list.filter((c) => !c.my_participant?.archived)
  } else {
    list = list.filter((c) => c.my_participant?.archived)
  }
  if (activeCategory.value === 'personal') list = list.filter((c) => !c.is_group)
  else if (activeCategory.value === 'groups')   list = list.filter((c) =>  c.is_group)
  else if (activeCategory.value === 'customer') list = list.filter((c) => c.my_participant?.label === 'customer')
  const q = search.value.toLowerCase()
  if (!q) return list
  return list.filter((c) => {
    if (c.is_group) return c.name?.toLowerCase().includes(q) || c.last_message?.text?.toLowerCase().includes(q)
    const o = getOther(c)
    return o?.username?.toLowerCase().includes(q) || o?.display_name?.toLowerCase().includes(q) || c.last_message?.text?.toLowerCase().includes(q)
  })
})

function getOther(conv: Conversation): MsgSender | undefined {
  return conv.other_participants?.[0]?.user
}
function isNotes(conv: Conversation): boolean {
  return !conv.is_group && (!conv.other_participants || conv.other_participants.length === 0)
}

function isUnread(conv: Conversation): boolean {
  if (!conv.last_message) return false
  if (conv.last_message.sender_id === auth.user?.id) return false
  const lastRead = conv.my_participant?.last_read_at
  if (!lastRead) return true
  return new Date(conv.last_message.created_at) > new Date(lastRead)
}

const STORY_REPLY_PREVIEW_RE = /^\[story_reply:[^\]]*\]/

function previewText(text: string | undefined): string {
  if (!text) return ''
  if (STORY_REPLY_PREVIEW_RE.test(text)) return '📸 Ответ на историю'
  return text
}

function formatTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDay = Math.floor(diffMs / 86_400_000)
  if (diffDay === 0) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  if (diffDay === 1) return 'вчера'
  if (diffDay < 7) return d.toLocaleDateString('ru', { weekday: 'short' })
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

// ── CRM label ──────────────────────────────────────────────────────────────
async function setLabel(conv: Conversation, label: string) {
  menuConvId.value = null
  try {
    await api.patch(`/messages/conversations/${conv.id}/label`, { label })
    // Update local state
    const local = store.conversations.find((c) => c.id === conv.id)
    if (local?.my_participant) (local.my_participant as any).label = label
  } catch { /* silent */ }
}

async function toggleArchive(conv: Conversation) {
  const newVal = !conv.my_participant?.archived
  try {
    await store.setArchived(conv.id, newVal)
    if (newVal && !showArchived.value) emit('select', store.conversations[0]?.id ?? '')
  } catch { /* silent */ }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
