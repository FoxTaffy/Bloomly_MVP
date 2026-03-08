<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import { useToGoStore, type ToGoItem } from '@/stores/toGo'

const router    = useRouter()
const toGo      = useToGoStore()
const nsfwMode  = ref(false)
const activeNav = ref('to-go')
const tab       = ref<'pending' | 'done'>('pending')
const editingNote = ref<string | null>(null)
const noteText    = ref('')

const typeIcons: Record<string, string> = {
  event:   'CalendarDays',
  post:    'FileText',
  listing: 'ShoppingBag',
  group:   'Users',
}
const typeLabels: Record<string, string> = {
  event:   'Мероприятие',
  post:    'Пост',
  listing: 'Товар',
  group:   'Группа',
}

const displayed = computed(() => tab.value === 'pending' ? toGo.pending : toGo.finished)

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}
function formatEventDate(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function openNote(item: ToGoItem) {
  editingNote.value = item.id
  noteText.value    = item.note ?? ''
}
function saveNote(id: string) {
  toGo.setNote(id, noteText.value)
  editingNote.value = null
}
function cancelNote() {
  editingNote.value = null
}

function navigate(item: ToGoItem) {
  router.push(item.url)
}

// Days until event
function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader v-model:nsfwMode="nsfwMode" />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar v-model:activeNav="activeNav" />

      <main class="flex-1 min-w-0 pb-28 md:pb-20">

        <!-- Header -->
        <div class="flex items-start justify-between mb-8 pt-2">
          <div>
            <h1 class="text-3xl font-extrabold text-white flex items-center gap-3">
              <span class="text-3xl">📌</span>
              To-go List
            </h1>
            <p class="text-white/45 text-sm mt-1">Твой список мест и событий, которые хочется посетить</p>
          </div>

          <!-- Stats mini-pills -->
          <div class="hidden md:flex items-center gap-2">
            <span class="px-3 py-1.5 rounded-full bg-brand-card border border-brand-border text-xs font-bold text-white/65">
              {{ toGo.pending.length }} запланировано
            </span>
            <span class="px-3 py-1.5 rounded-full bg-brand-success/10 border border-brand-success/20 text-xs font-bold text-brand-success">
              {{ toGo.finished.length }} выполнено
            </span>
          </div>
        </div>

        <!-- Upcoming events strip -->
        <div v-if="toGo.upcomingEvents.length" class="mb-6">
          <h2 class="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
            <BIcon name="CalendarDays" class="w-3.5 h-3.5" />
            Ближайшие события
          </h2>
          <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            <div
              v-for="ev in toGo.upcomingEvents.slice(0, 6)"
              :key="ev.id"
              class="flex-shrink-0 w-52 bg-brand-card border border-brand-border rounded-2xl p-3 cursor-pointer hover:border-brand-accent/40 transition-colors"
              @click="navigate(ev)"
            >
              <div class="relative mb-2.5">
                <div v-if="ev.imageUrl" class="w-full h-24 rounded-xl overflow-hidden">
                  <img :src="ev.imageUrl" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-full h-24 rounded-xl bg-gradient-to-br from-brand-accent/20 to-brand-accent/5 flex items-center justify-center">
                  <BIcon name="CalendarDays" class="w-8 h-8 text-brand-accent/50" />
                </div>
                <!-- Days until badge -->
                <div v-if="ev.startsAt"
                  class="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-lg text-[10px] font-extrabold"
                  :class="daysUntil(ev.startsAt) <= 3 ? 'bg-brand-error text-white' : daysUntil(ev.startsAt) <= 7 ? 'bg-brand-yellow text-brand-bg' : 'bg-brand-accent text-white'">
                  {{ daysUntil(ev.startsAt) === 0 ? 'Сегодня' : daysUntil(ev.startsAt) === 1 ? 'Завтра' : `${daysUntil(ev.startsAt)}д` }}
                </div>
              </div>
              <p class="text-xs font-bold text-white line-clamp-2 mb-1">{{ ev.title }}</p>
              <p v-if="ev.startsAt" class="text-[10px] text-white/40 flex items-center gap-1">
                <BIcon name="Clock" class="w-3 h-3" />
                {{ formatEventDate(ev.startsAt) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex items-center gap-2 mb-5">
          <button
            v-for="t in [{ id:'pending', label: 'Запланировано' }, { id:'done', label: 'Выполнено' }]"
            :key="t.id"
            @click="tab = t.id as any"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all"
            :class="tab === t.id ? 'bg-brand-card text-white border border-brand-border' : 'text-white/45 hover:text-white'">
            {{ t.label }}
            <span class="ml-1.5 text-[10px] font-black opacity-60">{{ t.id === 'pending' ? toGo.pending.length : toGo.finished.length }}</span>
          </button>

          <!-- Clear done -->
          <button v-if="tab === 'done' && toGo.finished.length"
            @click="toGo.clearDone()"
            class="ml-auto text-xs text-brand-error/70 hover:text-brand-error transition-colors flex items-center gap-1.5">
            <BIcon name="Trash2" class="w-3.5 h-3.5" />
            Очистить
          </button>
        </div>

        <!-- Empty state -->
        <div v-if="!displayed.length" class="text-center py-24">
          <div class="text-6xl mb-4">{{ tab === 'pending' ? '📌' : '✅' }}</div>
          <p class="text-white/45 text-base font-semibold">
            {{ tab === 'pending' ? 'Список пуст' : 'Нет выполненных пунктов' }}
          </p>
          <p class="text-white/30 text-sm mt-1">
            {{ tab === 'pending' ? 'Добавляй события, посты и товары из любого раздела' : 'Отмечай пункты как выполненные' }}
          </p>
        </div>

        <!-- Items list -->
        <div v-else class="space-y-3">
          <div
            v-for="item in displayed"
            :key="item.id"
            class="group bg-brand-card border border-brand-border rounded-2xl overflow-hidden transition-all hover:border-brand-border/60"
            :class="item.done ? 'opacity-60' : ''"
          >
            <div class="flex items-start gap-3 p-4">
              <!-- Thumbnail -->
              <div class="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden cursor-pointer" @click="navigate(item)">
                <img v-if="item.imageUrl" :src="item.imageUrl" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full bg-brand-accent/10 flex items-center justify-center">
                  <BIcon :name="typeIcons[item.type]" class="w-6 h-6 text-brand-accent/60" />
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0 cursor-pointer" @click="navigate(item)">
                <div class="flex items-center gap-2 mb-0.5">
                  <span class="text-[10px] font-extrabold uppercase tracking-widest text-white/35">
                    {{ typeLabels[item.type] }}
                  </span>
                  <span v-if="item.type === 'event' && item.startsAt && !item.done"
                    class="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    :class="daysUntil(item.startsAt) <= 3 ? 'bg-brand-error/15 text-brand-error' : 'bg-brand-accent/10 text-brand-accent'">
                    {{ daysUntil(item.startsAt) <= 0 ? 'Сегодня' : `через ${daysUntil(item.startsAt)}д` }}
                  </span>
                </div>
                <h3 class="font-bold text-white text-sm leading-tight line-clamp-2 mb-0.5">{{ item.title }}</h3>
                <div class="flex items-center gap-2 text-[11px] text-white/40">
                  <span v-if="item.subtitle">{{ item.subtitle }}</span>
                  <span v-if="item.locationName" class="flex items-center gap-1">
                    <BIcon name="MapPin" class="w-3 h-3" />
                    {{ item.locationName }}
                  </span>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <!-- Toggle done -->
                <button
                  @click="toGo.toggle(item.id)"
                  class="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                  :class="item.done ? 'bg-brand-success/15 text-brand-success' : 'bg-brand-card/80 text-white/50 hover:bg-brand-success/15 hover:text-brand-success border border-brand-border'"
                  :title="item.done ? 'Отметить как невыполненное' : 'Отметить как выполненное'"
                >
                  <BIcon :name="item.done ? 'CheckCircle2' : 'Circle'" class="w-4 h-4" />
                </button>
                <!-- Note -->
                <button
                  @click="openNote(item)"
                  class="w-8 h-8 rounded-xl flex items-center justify-center bg-brand-card/80 text-white/50 hover:bg-brand-accent/15 hover:text-brand-accent border border-brand-border transition-all"
                  title="Заметка"
                >
                  <BIcon :name="item.note ? 'StickyNote' : 'Plus'" class="w-4 h-4" />
                </button>
                <!-- Delete -->
                <button
                  @click="toGo.remove(item.id)"
                  class="w-8 h-8 rounded-xl flex items-center justify-center bg-brand-card/80 text-white/50 hover:bg-brand-error/15 hover:text-brand-error border border-brand-border transition-all"
                  title="Удалить"
                >
                  <BIcon name="Trash2" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Note display / edit -->
            <div v-if="item.note && editingNote !== item.id"
              class="px-4 pb-3 -mt-1">
              <p class="text-xs text-white/40 bg-white/4 rounded-xl px-3 py-2 border border-white/6 flex items-start gap-2">
                <BIcon name="StickyNote" class="w-3 h-3 flex-shrink-0 mt-0.5 text-brand-accent/60" />
                {{ item.note }}
              </p>
            </div>

            <!-- Note editor -->
            <div v-if="editingNote === item.id" class="px-4 pb-3 -mt-1">
              <div class="bg-white/4 rounded-xl border border-white/10 overflow-hidden">
                <textarea
                  v-model="noteText"
                  class="w-full bg-transparent text-xs text-white/70 px-3 pt-2.5 pb-1 resize-none outline-none placeholder-white/25"
                  rows="2"
                  placeholder="Добавь заметку…"
                  @keydown.enter.prevent="saveNote(item.id)"
                  @keydown.esc="cancelNote()"
                />
                <div class="flex items-center justify-end gap-2 px-3 pb-2.5">
                  <button @click="cancelNote()" class="text-[11px] text-white/40 hover:text-white transition-colors">Отмена</button>
                  <button @click="saveNote(item.id)" class="text-[11px] font-bold text-brand-accent hover:text-brand-accent-plus transition-colors">Сохранить</button>
                </div>
              </div>
            </div>

            <!-- Added date -->
            <div class="px-4 pb-3 flex items-center gap-1.5 text-[10px] text-white/25">
              <BIcon name="Clock" class="w-3 h-3" />
              Добавлено {{ formatDate(item.addedAt) }}
            </div>
          </div>
        </div>

      </main>
    </div>
  </div>
</template>
