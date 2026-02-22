<script setup lang="ts">
import { ref } from 'vue'
import type { Component } from 'vue'
import {
  /* Header */
  Search, Bell, MessageCircle,
  /* Navigation */
  Home, Compass, User, Settings,
  /* Create Post */
  Image as ImageIcon, Film, Smile, MapPin, Plus,
  /* Event card */
  Calendar, Heart, MessageSquare, Share2, Bookmark, MoreHorizontal,
  /* Right sidebar */
  TrendingUp, Hash, ChevronRight, Users,
} from 'lucide-vue-next'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Story {
  id: number
  username: string
  avatar: string
  hasNew: boolean
}

interface NavItem {
  id: string
  label: string
  icon: Component
  badge?: number
}

interface Tag {
  id: number
  name: string
  count: string
}

interface SuggestedUser {
  id: number
  name: string
  username: string
  avatar: string
  following: boolean
}

// ─── Reactive state ───────────────────────────────────────────────────────────

const searchQuery  = ref('')
const postContent  = ref('')
const activeNav    = ref('home')

// ─── Stories ─────────────────────────────────────────────────────────────────

const stories = ref<Story[]>([
  { id: 1, username: 'alice_art',  avatar: 'https://i.pravatar.cc/80?img=1',  hasNew: true  },
  { id: 2, username: 'bob_photo',  avatar: 'https://i.pravatar.cc/80?img=2',  hasNew: true  },
  { id: 3, username: 'carol_m',    avatar: 'https://i.pravatar.cc/80?img=3',  hasNew: false },
  { id: 4, username: 'david_k',    avatar: 'https://i.pravatar.cc/80?img=4',  hasNew: true  },
  { id: 5, username: 'eva_sky',    avatar: 'https://i.pravatar.cc/80?img=5',  hasNew: false },
  { id: 6, username: 'frank_dev',  avatar: 'https://i.pravatar.cc/80?img=11', hasNew: true  },
  { id: 7, username: 'grace_ui',   avatar: 'https://i.pravatar.cc/80?img=12', hasNew: false },
])

// ─── Navigation ──────────────────────────────────────────────────────────────

const navItems = ref<NavItem[]>([
  { id: 'home',          label: 'Главная',      icon: Home          },
  { id: 'explore',       label: 'Исследовать',  icon: Compass       },
  { id: 'messages',      label: 'Сообщения',    icon: MessageCircle, badge: 3  },
  { id: 'notifications', label: 'Уведомления',  icon: Bell,          badge: 12 },
  { id: 'profile',       label: 'Профиль',      icon: User          },
  { id: 'settings',      label: 'Настройки',    icon: Settings      },
])

// ─── Categories ──────────────────────────────────────────────────────────────

const categories = ref([
  { id: 1, name: 'Фотография',       emoji: '📷' },
  { id: 2, name: 'Арт',              emoji: '🎨' },
  { id: 3, name: 'Музыка',           emoji: '🎵' },
  { id: 4, name: 'Технологии',       emoji: '💻' },
  { id: 5, name: 'Путешествия',      emoji: '✈️' },
])

// ─── Trending tags ────────────────────────────────────────────────────────────

const trendingTags = ref<Tag[]>([
  { id: 1, name: 'hi res',       count: '3.6m' },
  { id: 2, name: 'digital art',  count: '2.1m' },
  { id: 3, name: 'photography',  count: '1.8m' },
  { id: 4, name: 'illustration', count: '945k' },
  { id: 5, name: 'design',       count: '712k' },
])

// ─── Suggested users ─────────────────────────────────────────────────────────

const suggestedUsers = ref<SuggestedUser[]>([
  { id: 1, name: 'Alex Morgan',  username: '@alex_m',  avatar: 'https://i.pravatar.cc/80?img=6', following: false },
  { id: 2, name: 'Sofia Chen',   username: '@sofia_c', avatar: 'https://i.pravatar.cc/80?img=7', following: false },
  { id: 3, name: 'Max Weber',    username: '@max_w',   avatar: 'https://i.pravatar.cc/80?img=8', following: true  },
])

// ─── Event post ──────────────────────────────────────────────────────────────

const eventPost = ref({
  author: {
    name:     'Bloomly Events',
    username: '@bloomly',
    avatar:   'https://i.pravatar.cc/80?img=9',
  },
  image:    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=720&h=320&fit=crop',
  title:    'Фестиваль цифрового искусства 2024',
  date:     '15 Июня, 2024',
  location: 'Москва, Россия',
  likes:    234,
  comments: 48,
  liked:    false,
  saved:    false,
})

// ─── Handlers ────────────────────────────────────────────────────────────────

function toggleFollow(id: number) {
  const user = suggestedUsers.value.find(u => u.id === id)
  if (user) user.following = !user.following
}

function toggleLike() {
  eventPost.value.liked = !eventPost.value.liked
  eventPost.value.likes += eventPost.value.liked ? 1 : -1
}

function toggleSave() {
  eventPost.value.saved = !eventPost.value.saved
}
</script>

<template>
  <div class="min-h-screen bg-[#16192F] font-nunito text-white">

    <!-- ═══════════════════════════════════════════════════════════════════════
         HEADER — фиксированный верхний бар
         ═══════════════════════════════════════════════════════════════════════ -->
    <header
      class="fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-4
             border-b border-[#2A2D45] bg-[#1F223C] px-4 md:px-6"
    >
      <!-- Логотип -->
      <div class="flex w-44 flex-shrink-0 items-center gap-2.5">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-xl
                 bg-gradient-to-br from-[#4C67CF] to-[#7B5EA7] shadow-lg"
        >
          <span class="text-sm font-extrabold text-white">B</span>
        </div>
        <span class="text-xl font-extrabold tracking-tight text-white">Bloomly</span>
      </div>

      <!-- Поиск -->
      <div class="mx-auto flex-1" style="max-width: 560px;">
        <div class="relative">
          <Search
            class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
          />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Поиск по Bloomly..."
            class="w-full rounded-2xl border border-[#2A2D45] bg-[#16192F]
                   py-2.5 pl-10 pr-4 text-sm text-white placeholder-[#6B7280]
                   outline-none transition-colors focus:border-[#4C67CF]"
          />
        </div>
      </div>

      <!-- Правые иконки -->
      <div class="flex w-44 flex-shrink-0 items-center justify-end gap-2">
        <!-- Уведомления -->
        <button
          class="relative rounded-xl border border-[#2A2D45] bg-[#16192F] p-2
                 transition-colors hover:border-[#4C67CF]"
        >
          <Bell class="h-5 w-5 text-[#F9FAFD]" />
          <span
            class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center
                   rounded-full bg-[#4C67CF] text-[10px] font-bold text-white"
          >3</span>
        </button>

        <!-- Сообщения -->
        <button
          class="rounded-xl border border-[#2A2D45] bg-[#16192F] p-2
                 transition-colors hover:border-[#4C67CF]"
        >
          <MessageCircle class="h-5 w-5 text-[#F9FAFD]" />
        </button>

        <!-- Аватар пользователя -->
        <button
          class="h-9 w-9 overflow-hidden rounded-xl ring-2 ring-[#4C67CF]
                 ring-offset-2 ring-offset-[#1F223C] transition-all hover:ring-[#7B5EA7]"
        >
          <img
            src="https://i.pravatar.cc/80?img=10"
            alt="Мой профиль"
            class="h-full w-full object-cover"
          />
        </button>
      </div>
    </header>

    <!-- ═══════════════════════════════════════════════════════════════════════
         BODY — трёхколоночная сетка под хедером
         ═══════════════════════════════════════════════════════════════════════ -->
    <div class="mx-auto flex max-w-screen-xl pt-16">

      <!-- ─────────────────────────────────────────────────────────────────────
           LEFT SIDEBAR — мини-профиль, навигация, категории
           Скрыт на мобильных и планшетах (< lg)
           ───────────────────────────────────────────────────────────────────── -->
      <aside
        class="sticky top-16 hidden h-[calc(100vh-4rem)] w-52 flex-shrink-0
               overflow-y-auto px-3 py-5 scrollbar-hide lg:block"
      >
        <!-- Мини-профиль -->
        <div class="mb-4 rounded-2xl border border-[#2A2D45] bg-[#1F223C] p-4">
          <div class="flex flex-col items-center text-center">
            <div
              class="mb-3 h-14 w-14 overflow-hidden rounded-2xl
                     ring-2 ring-[#4C67CF] ring-offset-2 ring-offset-[#1F223C]"
            >
              <img
                src="https://i.pravatar.cc/80?img=10"
                alt="Профиль"
                class="h-full w-full object-cover"
              />
            </div>
            <p class="text-sm font-bold text-white">Alex Johnson</p>
            <p class="mb-4 text-xs text-[#6B7280]">@alex_johnson</p>

            <!-- Статистика -->
            <div class="flex w-full items-center justify-center gap-3">
              <div class="text-center">
                <p class="text-sm font-bold text-white">1.2k</p>
                <p class="text-[10px] text-[#6B7280]">Подписки</p>
              </div>
              <div class="h-6 w-px bg-[#2A2D45]"></div>
              <div class="text-center">
                <p class="text-sm font-bold text-white">3.4k</p>
                <p class="text-[10px] text-[#6B7280]">Подписчики</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Навигация -->
        <nav class="mb-4 space-y-0.5">
          <button
            v-for="item in navItems"
            :key="item.id"
            @click="activeNav = item.id"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5
                   text-sm font-semibold transition-all duration-150"
            :class="activeNav === item.id
              ? 'bg-[#4C67CF] text-white shadow-lg shadow-[#4C67CF]/20'
              : 'text-[#9CA3AF] hover:bg-[#1F223C] hover:text-white'"
          >
            <component :is="item.icon" class="h-4 w-4 flex-shrink-0" />
            <span>{{ item.label }}</span>
            <span
              v-if="item.badge"
              class="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              :class="activeNav === item.id
                ? 'bg-white/20 text-white'
                : 'bg-[#4C67CF] text-white'"
            >{{ item.badge }}</span>
          </button>
        </nav>

        <!-- Категории -->
        <div class="rounded-2xl border border-[#2A2D45] bg-[#1F223C] p-3">
          <p class="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">
            Категории
          </p>
          <button
            v-for="cat in categories"
            :key="cat.id"
            class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2
                   text-[#9CA3AF] transition-colors hover:bg-[#16192F] hover:text-white"
          >
            <span class="text-base leading-none">{{ cat.emoji }}</span>
            <span class="text-xs font-medium">{{ cat.name }}</span>
          </button>
        </div>
      </aside>

      <!-- ─────────────────────────────────────────────────────────────────────
           MAIN CONTENT — истории, создание поста, карточка мероприятия
           ───────────────────────────────────────────────────────────────────── -->
      <main class="min-w-0 flex-1 px-3 py-5 lg:px-5">
        <div class="mx-auto max-w-[680px] space-y-5">

          <!-- ── Истории (Stories) ──────────────────────────────────────────── -->
          <section>
            <div class="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">

              <!-- Добавить историю -->
              <div class="flex-shrink-0">
                <div
                  class="flex h-28 w-[88px] cursor-pointer flex-col items-center
                         justify-center gap-2 rounded-2xl border border-dashed
                         border-[#2A2D45] bg-[#1F223C] transition-all
                         hover:border-[#4C67CF] hover:shadow-lg hover:shadow-[#4C67CF]/10"
                >
                  <div
                    class="flex h-9 w-9 items-center justify-center rounded-full
                           bg-[#4C67CF] shadow-md shadow-[#4C67CF]/30"
                  >
                    <Plus class="h-4 w-4 text-white" />
                  </div>
                  <span class="text-[10px] font-semibold text-[#6B7280]">Добавить</span>
                </div>
              </div>

              <!-- Карточки историй -->
              <div
                v-for="story in stories"
                :key="story.id"
                class="group relative flex-shrink-0 h-28 w-[88px] cursor-pointer
                       overflow-hidden rounded-2xl border bg-[#1F223C]
                       transition-all duration-200 hover:scale-[1.03]"
                :class="story.hasNew
                  ? 'border-[#4C67CF] shadow-md shadow-[#4C67CF]/20'
                  : 'border-[#2A2D45]'"
              >
                <!-- Фоновое изображение -->
                <img
                  :src="`https://picsum.photos/seed/${story.id + 30}/88/112`"
                  :alt="story.username"
                  class="absolute inset-0 h-full w-full object-cover transition-transform
                         duration-300 group-hover:scale-110"
                />
                <!-- Градиентный оверлей -->
                <div
                  class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/20"
                ></div>
                <!-- Аватар пользователя -->
                <div
                  class="absolute left-2 top-2 h-8 w-8 overflow-hidden rounded-full"
                  :class="story.hasNew
                    ? 'ring-2 ring-[#4C67CF]'
                    : 'ring-2 ring-white/40'"
                >
                  <img
                    :src="story.avatar"
                    :alt="story.username"
                    class="h-full w-full object-cover"
                  />
                </div>
                <!-- Имя пользователя -->
                <p
                  class="absolute inset-x-1 bottom-1.5 truncate text-center
                         text-[9px] font-semibold text-white drop-shadow"
                >
                  {{ story.username }}
                </p>
              </div>
            </div>
          </section>

          <!-- ── Создание поста ─────────────────────────────────────────────── -->
          <section class="rounded-2xl border border-[#2A2D45] bg-[#1F223C] p-4">
            <!-- Строка ввода -->
            <div class="mb-3 flex items-start gap-3">
              <div
                class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl
                       ring-2 ring-[#4C67CF]/40"
              >
                <img
                  src="https://i.pravatar.cc/80?img=10"
                  alt="Аватар"
                  class="h-full w-full object-cover"
                />
              </div>
              <textarea
                v-model="postContent"
                placeholder="OWO what is this?"
                rows="2"
                class="flex-1 resize-none rounded-xl border border-[#2A2D45]
                       bg-[#16192F] px-4 py-2.5 text-sm text-white
                       placeholder-[#6B7280] outline-none transition-colors
                       focus:border-[#4C67CF]"
              ></textarea>
            </div>

            <!-- Кнопки вложений + Опубликовать -->
            <div class="flex items-center justify-between">
              <div class="flex flex-wrap gap-1.5">
                <button
                  class="flex items-center gap-1.5 rounded-xl border border-[#2A2D45]
                         bg-[#16192F] px-3 py-1.5 text-xs text-[#9CA3AF] transition-colors
                         hover:border-[#4C67CF] hover:text-white"
                >
                  <ImageIcon class="h-3.5 w-3.5" />
                  <span class="hidden sm:inline">Фото</span>
                </button>
                <button
                  class="flex items-center gap-1.5 rounded-xl border border-[#2A2D45]
                         bg-[#16192F] px-3 py-1.5 text-xs text-[#9CA3AF] transition-colors
                         hover:border-[#4C67CF] hover:text-white"
                >
                  <Film class="h-3.5 w-3.5" />
                  <span class="hidden sm:inline">Видео</span>
                </button>
                <button
                  class="flex items-center gap-1.5 rounded-xl border border-[#2A2D45]
                         bg-[#16192F] px-3 py-1.5 text-xs text-[#9CA3AF] transition-colors
                         hover:border-[#4C67CF] hover:text-white"
                >
                  <Smile class="h-3.5 w-3.5" />
                  <span class="hidden sm:inline">Эмодзи</span>
                </button>
                <button
                  class="flex items-center gap-1.5 rounded-xl border border-[#2A2D45]
                         bg-[#16192F] px-3 py-1.5 text-xs text-[#9CA3AF] transition-colors
                         hover:border-[#4C67CF] hover:text-white"
                >
                  <MapPin class="h-3.5 w-3.5" />
                  <span class="hidden sm:inline">Место</span>
                </button>
              </div>

              <button
                :disabled="!postContent.trim()"
                class="rounded-xl bg-[#4C67CF] px-5 py-1.5 text-sm font-semibold
                       text-white shadow-md shadow-[#4C67CF]/20 transition-all
                       hover:bg-[#5a77e0] hover:shadow-lg hover:shadow-[#4C67CF]/30
                       disabled:cursor-not-allowed disabled:opacity-40"
              >
                Опубликовать
              </button>
            </div>
          </section>

          <!-- ── Карточка мероприятия/поста ────────────────────────────────── -->
          <article class="overflow-hidden rounded-2xl border border-[#2A2D45] bg-[#1F223C]">
            <!-- Шапка карточки -->
            <div class="flex items-center gap-3 p-4 pb-3">
              <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl">
                <img
                  :src="eventPost.author.avatar"
                  :alt="eventPost.author.name"
                  class="h-full w-full object-cover"
                />
              </div>
              <div class="flex-1">
                <p class="text-sm font-semibold text-white">{{ eventPost.author.name }}</p>
                <p class="text-xs text-[#6B7280]">{{ eventPost.author.username }}</p>
              </div>
              <button
                class="rounded-lg p-1.5 text-[#6B7280] transition-colors
                       hover:bg-[#16192F] hover:text-white"
              >
                <MoreHorizontal class="h-5 w-5" />
              </button>
            </div>

            <!-- Изображение мероприятия с наложенной информацией -->
            <div class="relative mx-4 mb-3 overflow-hidden rounded-2xl">
              <img
                :src="eventPost.image"
                :alt="eventPost.title"
                class="h-56 w-full object-cover"
              />
              <!-- Градиентный оверлей снизу -->
              <div
                class="absolute inset-0 bg-gradient-to-t
                       from-[#0d0f22]/95 via-[#0d0f22]/30 to-transparent"
              ></div>

              <!-- Бейдж "Мероприятие" -->
              <span
                class="absolute left-3 top-3 rounded-full bg-[#4C67CF] px-3 py-1
                       text-xs font-bold text-white shadow-md shadow-[#4C67CF]/30"
              >
                Мероприятие
              </span>

              <!-- Заголовок и мета-данные на изображении -->
              <div class="absolute inset-x-3 bottom-3">
                <h3 class="mb-2 text-lg font-bold leading-snug text-white drop-shadow">
                  {{ eventPost.title }}
                </h3>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div class="flex items-center gap-1.5">
                    <Calendar class="h-3.5 w-3.5 text-[#4C67CF]" />
                    <span class="text-xs text-[#9CA3AF]">{{ eventPost.date }}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <MapPin class="h-3.5 w-3.5 text-[#4C67CF]" />
                    <span class="text-xs text-[#9CA3AF]">{{ eventPost.location }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Панель действий -->
            <div class="flex items-center px-4 pb-4">
              <!-- Лайк -->
              <button
                @click="toggleLike"
                class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs
                       font-medium transition-all"
                :class="eventPost.liked
                  ? 'text-red-400'
                  : 'text-[#6B7280] hover:text-white'"
              >
                <Heart
                  class="h-4 w-4 transition-transform"
                  :class="eventPost.liked ? 'scale-110' : ''"
                  :fill="eventPost.liked ? 'currentColor' : 'none'"
                />
                {{ eventPost.likes }}
              </button>

              <!-- Комментарий -->
              <button
                class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs
                       font-medium text-[#6B7280] transition-colors hover:text-white"
              >
                <MessageSquare class="h-4 w-4" />
                {{ eventPost.comments }}
              </button>

              <!-- Поделиться -->
              <button
                class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs
                       font-medium text-[#6B7280] transition-colors hover:text-white"
              >
                <Share2 class="h-4 w-4" />
                <span class="hidden sm:inline">Поделиться</span>
              </button>

              <!-- Сохранить -->
              <button
                @click="toggleSave"
                class="ml-auto rounded-xl px-3 py-2 transition-all"
                :class="eventPost.saved
                  ? 'text-[#4C67CF]'
                  : 'text-[#6B7280] hover:text-white'"
              >
                <Bookmark
                  class="h-4 w-4"
                  :fill="eventPost.saved ? 'currentColor' : 'none'"
                />
              </button>
            </div>
          </article>

        </div>
      </main>

      <!-- ─────────────────────────────────────────────────────────────────────
           RIGHT SIDEBAR — популярные теги, возможно знакомы
           Скрыт до xl-брейкпоинта
           ───────────────────────────────────────────────────────────────────── -->
      <aside
        class="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 flex-shrink-0
               overflow-y-auto px-3 py-5 scrollbar-hide xl:block"
      >
        <!-- Популярные теги -->
        <div class="mb-4 rounded-2xl border border-[#2A2D45] bg-[#1F223C] p-4">
          <div class="mb-4 flex items-center justify-between">
            <p class="text-sm font-bold text-white">Популярные теги</p>
            <TrendingUp class="h-4 w-4 text-[#4C67CF]" />
          </div>

          <div class="space-y-3">
            <div
              v-for="(tag, index) in trendingTags"
              :key="tag.id"
              class="group flex cursor-pointer items-center gap-3"
            >
              <!-- Ранг -->
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl
                       bg-[#16192F] text-xs font-bold text-[#4C67CF] transition-all
                       group-hover:bg-[#4C67CF] group-hover:text-white"
              >
                {{ index + 1 }}
              </div>

              <!-- Тег -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1">
                  <Hash class="h-3 w-3 flex-shrink-0 text-[#4C67CF]" />
                  <p
                    class="truncate text-sm font-medium text-[#F9FAFD] transition-colors
                           group-hover:text-[#4C67CF]"
                  >{{ tag.name }}</p>
                </div>
                <p class="text-xs text-[#6B7280]">{{ tag.count }} публикаций</p>
              </div>

              <ChevronRight
                class="h-4 w-4 flex-shrink-0 text-[#2A2D45] transition-colors
                       group-hover:text-[#4C67CF]"
              />
            </div>
          </div>
        </div>

        <!-- Возможно знакомы -->
        <div class="rounded-2xl border border-[#2A2D45] bg-[#1F223C] p-4">
          <div class="mb-4 flex items-center justify-between">
            <p class="text-sm font-bold text-white">Возможно знакомы</p>
            <Users class="h-4 w-4 text-[#4C67CF]" />
          </div>

          <div class="space-y-3">
            <div
              v-for="user in suggestedUsers"
              :key="user.id"
              class="flex items-center gap-3"
            >
              <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl">
                <img
                  :src="user.avatar"
                  :alt="user.name"
                  class="h-full w-full object-cover"
                />
              </div>

              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-white">{{ user.name }}</p>
                <p class="truncate text-xs text-[#6B7280]">{{ user.username }}</p>
              </div>

              <button
                @click="toggleFollow(user.id)"
                class="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold
                       transition-all duration-150"
                :class="user.following
                  ? 'border border-[#2A2D45] bg-[#16192F] text-[#9CA3AF] hover:border-red-500/50 hover:text-red-400'
                  : 'bg-[#4C67CF] text-white shadow-md shadow-[#4C67CF]/20 hover:bg-[#5a77e0]'"
              >
                {{ user.following ? 'Отписаться' : 'Следить' }}
              </button>
            </div>
          </div>

          <button
            class="mt-4 w-full rounded-xl py-2 text-xs font-semibold text-[#4C67CF]
                   transition-colors hover:bg-[#4C67CF]/10 hover:text-white"
          >
            Смотреть всех →
          </button>
        </div>
      </aside>

    </div><!-- end body -->
  </div><!-- end root -->
</template>
