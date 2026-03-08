<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import TicketCard from '@/components/groups/TicketCard.vue'
import SoonBadge from '@/components/groups/SoonBadge.vue'
import SoonPopup from '@/components/groups/SoonPopup.vue'
import { useGroupsStore } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useToGoStore } from '@/stores/toGo'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()

const nsfwMode = useNsfwMode().nsfwEnabled
const activeNav = ref('groups')
const showSoonPopup = ref(false)

const event = computed(() => groupsStore.currentEvent)

const daysLeft = computed(() => {
  if (!event.value) return 0
  const diff = new Date(event.value.starts_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
})

const dateRange = computed(() => {
  if (!event.value) return ''
  const s = new Date(event.value.starts_at)
  const e = new Date(event.value.ends_at)
  const fmt = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}-${e.getDate()} ${s.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`
  }
  return `${fmt(s)} — ${fmt(e)}`
})

const statusLabel = computed(() => {
  if (!event.value) return ''
  const map: Record<string, string> = {
    announced: 'Анонсировано',
    tickets_open: 'Билеты открыты',
    sold_out: 'Sold Out',
    active: 'Идёт сейчас',
    finished: 'Завершено',
    teaser: 'Тизер',
  }
  return map[event.value.status] ?? event.value.status
})

const statusColor = computed(() => {
  if (!event.value) return ''
  const map: Record<string, string> = {
    announced: 'bg-brand-success/15 text-brand-success',
    tickets_open: 'bg-brand-success/15 text-brand-success',
    sold_out: 'bg-brand-error/15 text-brand-error',
    active: 'bg-brand-yellow/15 text-brand-yellow',
    finished: 'bg-brand-muted/15 text-white/40',
    teaser: 'bg-brand-purple/15 text-brand-purple',
  }
  return map[event.value.status] ?? 'bg-brand-muted/15'
})

const hasMySoonBadge = computed(() => {
  if (!event.value || !authStore.user) return false
  return event.value.soonBadges?.some(b => b.user_id === authStore.user!.id) ?? false
})

const isFoggy = computed(() => event.value?.status === 'teaser' || event.value?.status === 'announced')

const attendeeLabel = computed(() => {
  if (!event.value) return ''
  const n = event.value.attendee_count
  if (n >= 1000) return `${(n / 1000).toFixed(0)}к`
  return String(n)
})

async function load() {
  await groupsStore.loadEvent(route.params.eventId as string)
}

onMounted(load)

async function handleToggleSoon() {
  if (!event.value) return
  if (hasMySoonBadge.value) {
    await groupsStore.toggleSoonBadge(event.value.id)
    await load()
  } else {
    showSoonPopup.value = true
  }
}

async function confirmSoon() {
  if (!event.value) return
  showSoonPopup.value = false
  await groupsStore.toggleSoonBadge(event.value.id)
  await load()
  if (authStore.user) await groupsStore.loadMySoonBadges(authStore.user.id)
}

function openMap() {
  if (!event.value?.location_lat || !event.value?.location_lng) return
  window.open(`https://www.google.com/maps?q=${event.value.location_lat},${event.value.location_lng}`, '_blank')
}

const toGo = useToGoStore()
const isInToGo = computed(() => event.value ? toGo.has(event.value.id) : false)

function toggleToGo() {
  if (!event.value) return
  if (isInToGo.value) {
    toGo.remove(event.value.id)
  } else {
    toGo.add({
      id:           event.value.id,
      type:         'event',
      title:        event.value.title,
      subtitle:     dateRange.value,
      imageUrl:     event.value.banner_url ?? undefined,
      url:          `/events/${event.value.id}`,
      startsAt:     event.value.starts_at,
      locationName: event.value.location_name ?? undefined,
    })
  }
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader v-model:nsfwMode="nsfwMode" />
    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar v-model:activeNav="activeNav" />

      <main class="flex-1 min-w-0 pb-28">
        <!-- Back -->
        <button
          class="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors"
          @click="router.back()"
        >
          <BIcon name="ArrowLeft" class="w-4 h-4" /> Назад
        </button>

        <div v-if="groupsStore.isLoading && !event" class="space-y-4">
          <div class="h-64 bg-brand-card border border-brand-border rounded-3xl animate-pulse" />
        </div>

        <template v-else-if="event">
          <!-- Banner -->
          <div class="relative h-56 md:h-72 rounded-3xl overflow-hidden mb-6">
            <img
              v-if="event.banner_url"
              :src="event.banner_url"
              :alt="event.title"
              class="w-full h-full object-cover"
              :class="{ 'blur-sm opacity-60': isFoggy }"
            />
            <div v-else class="w-full h-full bg-gradient-to-br from-brand-accent/30 to-brand-purple/20" />

            <!-- Fog overlay for teaser/announced -->
            <div v-if="isFoggy" class="absolute inset-0 event-fog" />

            <!-- Gradient overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-brand-bg via-brand-bg/40 to-transparent" />

            <!-- Content -->
            <div class="absolute bottom-4 left-4 right-4">
              <div class="flex items-center gap-2 mb-2">
                <SoonBadge :short-code="event.short_code" />
                <span class="text-xs font-bold px-2 py-0.5 rounded-lg" :class="statusColor">
                  {{ statusLabel }}
                </span>
                <span v-if="event.is_top" class="text-xs font-bold px-2 py-0.5 rounded-lg bg-brand-yellow/15 text-brand-yellow">
                  Топ событие
                </span>
              </div>
              <h1 class="text-3xl font-extrabold text-white drop-shadow-lg mb-1">{{ event.title }}</h1>
              <p v-if="daysLeft > 0" class="text-white/60 text-sm">осталось {{ daysLeft }} дней</p>
              <p v-else-if="event.status === 'active'" class="text-brand-success text-sm font-bold">Прямо сейчас!</p>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Main content -->
            <div class="lg:col-span-2 space-y-5">

              <!-- Info cards -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Date -->
                <div class="bg-brand-card border border-brand-border rounded-2xl p-4 flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-brand-accent/10 flex items-center justify-center shrink-0">
                    <BIcon name="Calendar" class="w-5 h-5 text-brand-accent" />
                  </div>
                  <div>
                    <p class="text-white/40 text-xs">Даты</p>
                    <p class="text-white font-bold text-sm">{{ dateRange }}</p>
                  </div>
                </div>
                <!-- Location -->
                <div
                  v-if="event.location_name"
                  class="bg-brand-card border border-brand-border rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-brand-accent/30 transition-colors"
                  @click="openMap"
                >
                  <div class="w-10 h-10 rounded-xl bg-brand-success/10 flex items-center justify-center shrink-0">
                    <BIcon name="MapPin" class="w-5 h-5 text-brand-success" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-white/40 text-xs">Локация</p>
                    <p class="text-white font-bold text-sm truncate">{{ event.location_name }}</p>
                  </div>
                  <BIcon name="ExternalLink" class="w-4 h-4 text-white/20 ml-auto shrink-0" />
                </div>
                <!-- Attendees -->
                <div class="bg-brand-card border border-brand-border rounded-2xl p-4 flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-brand-purple/10 flex items-center justify-center shrink-0">
                    <BIcon name="Users" class="w-5 h-5 text-brand-purple" />
                  </div>
                  <div>
                    <p class="text-white/40 text-xs">Участники</p>
                    <p class="text-white font-bold text-sm">{{ attendeeLabel }}</p>
                  </div>
                </div>
              </div>

              <!-- Description -->
              <div v-if="event.description" class="bg-brand-card border border-brand-border rounded-3xl p-5">
                <p class="text-white/60 text-sm leading-relaxed whitespace-pre-line">{{ event.description }}</p>
              </div>

              <!-- Tickets -->
              <section v-if="event.tickets?.length">
                <h2 class="text-lg font-extrabold text-white mb-3 flex items-center gap-2">
                  <BIcon name="Ticket" class="w-5 h-5 text-brand-accent" />
                  Билеты
                </h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TicketCard
                    v-for="tier in event.tickets"
                    :key="tier.id"
                    :tier="tier"
                  />
                </div>
              </section>

              <!-- No tickets + SOON button -->
              <section v-else-if="event.status === 'announced' || event.status === 'teaser'">
                <div class="relative overflow-hidden bg-brand-card border border-brand-border rounded-3xl p-8 text-center">
                  <!-- Background glow -->
                  <div class="absolute inset-0 pointer-events-none">
                    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-brand-yellow/8 rounded-full blur-2xl" />
                  </div>
                  <div class="relative">
                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-yellow/10 border border-brand-yellow/20 mb-4">
                      <span class="text-3xl">✦</span>
                    </div>
                    <div class="flex items-center justify-center gap-2 mb-2">
                      <SoonBadge :short-code="event.short_code" />
                    </div>
                    <p class="text-white font-extrabold text-lg mb-1">Билеты скоро откроются</p>
                    <p class="text-white/40 text-sm mb-6">Отметь «Интересует» — и точно не пропустишь</p>
                    <button
                      class="inline-flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm transition-all duration-200 active:scale-95"
                      :class="hasMySoonBadge
                        ? 'bg-brand-success/15 text-brand-success border border-brand-success/30 hover:bg-brand-error/10 hover:text-brand-error hover:border-brand-error/30'
                        : 'bg-brand-accent text-white hover:bg-brand-accent-plus shadow-lg shadow-brand-accent/25'"
                      @click="handleToggleSoon"
                    >
                      <BIcon :name="hasMySoonBadge ? 'Check' : 'Star'" class="w-4 h-4" />
                      {{ hasMySoonBadge ? 'Интересует ✓' : 'Интересует' }}
                    </button>
                    <p v-if="event._count.soonBadges" class="text-white/30 text-xs mt-3">
                      {{ event._count.soonBadges }} {{ event._count.soonBadges === 1 ? 'человек' : 'человек' }} уже отметил(и)
                    </p>
                  </div>
                </div>
              </section>

              <!-- Interested users (SOON avatars) -->
              <section v-if="event.soonBadges?.length">
                <h2 class="text-sm font-extrabold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <BIcon name="Users" class="w-3.5 h-3.5" />
                  Собираются пойти
                </h2>
                <div class="flex flex-wrap gap-2">
                  <div
                    v-for="badge in event.soonBadges"
                    :key="badge.id"
                    class="flex items-center gap-2 bg-brand-card border border-brand-border hover:border-brand-accent/30 rounded-xl px-3 py-2 cursor-pointer transition-all hover:bg-brand-bg/40 active:scale-95"
                    @click="router.push({ name: 'profile', params: { id: badge.user.id } })"
                  >
                    <div class="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-brand-accent/20 ring-1 ring-brand-border">
                      <img v-if="badge.user.avatar_url" :src="badge.user.avatar_url" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full flex items-center justify-center text-[10px] font-bold text-brand-accent">
                        {{ (badge.user.display_name || badge.user.username)[0].toUpperCase() }}
                      </div>
                    </div>
                    <span class="text-white text-xs font-semibold">{{ badge.user.display_name || badge.user.username }}</span>
                    <SoonBadge :short-code="event.short_code" size="sm" />
                  </div>
                </div>
              </section>
            </div>

            <!-- Sidebar -->
            <div class="space-y-4">
              <!-- SOON action card -->
              <div class="relative overflow-hidden bg-brand-card border border-brand-border rounded-3xl p-5">
                <!-- Subtle glow effect -->
                <div class="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                  :class="hasMySoonBadge ? 'bg-brand-success/10' : 'bg-brand-accent/8'" />
                <div class="relative">
                  <!-- Badge preview -->
                  <div class="flex items-center gap-2 mb-3">
                    <SoonBadge :short-code="event.short_code" />
                    <span class="text-white font-extrabold text-sm">Интересует?</span>
                  </div>
                  <!-- Mini avatars of interested users -->
                  <div v-if="event.soonBadges?.length" class="flex items-center gap-1 mb-3">
                    <div class="flex -space-x-1.5">
                      <div v-for="b in event.soonBadges.slice(0, 5)" :key="b.id"
                        class="w-6 h-6 rounded-full border-2 border-brand-card overflow-hidden bg-brand-accent/20 flex-shrink-0">
                        <img v-if="b.user.avatar_url" :src="b.user.avatar_url" class="w-full h-full object-cover" />
                        <div v-else class="w-full h-full flex items-center justify-center text-[8px] font-bold text-brand-accent">
                          {{ (b.user.display_name || b.user.username)[0].toUpperCase() }}
                        </div>
                      </div>
                    </div>
                    <span class="text-white/40 text-[11px] ml-1">
                      {{ event._count.soonBadges }} чел{{ event._count.soonBadges % 10 === 1 && event._count.soonBadges % 100 !== 11 ? 'овек' : 'овек' }}
                    </span>
                  </div>
                  <p v-else class="text-white/30 text-[11px] mb-3">Будь первым!</p>
                  <button
                    class="w-full py-2.5 rounded-2xl font-bold text-sm transition-all duration-200 active:scale-[0.98]"
                    :class="hasMySoonBadge
                      ? 'bg-brand-success/15 text-brand-success border border-brand-success/30 hover:bg-brand-error/10 hover:text-brand-error hover:border-brand-error/30'
                      : 'bg-brand-accent text-white hover:bg-brand-accent-plus shadow-lg shadow-brand-accent/20'"
                    @click="handleToggleSoon"
                  >
                    {{ hasMySoonBadge ? '✓ Интересует' : 'Интересует' }}
                  </button>
                </div>
              </div>

              <!-- To-go card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl p-5 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                  :class="isInToGo ? 'bg-brand-accent/20' : 'bg-brand-border/60'">
                  <BIcon name="Bookmark" class="w-5 h-5" :class="isInToGo ? 'text-brand-accent' : 'text-white/40'" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-white text-sm font-bold">{{ isInToGo ? 'В To-go списке' : 'To-go list' }}</p>
                  <p class="text-white/30 text-xs">{{ isInToGo ? 'Добавлено, нажми чтобы убрать' : 'Сохранить в личный список' }}</p>
                </div>
                <button
                  @click="toggleToGo"
                  class="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                  :class="isInToGo ? 'bg-brand-error/10 text-brand-error border border-brand-error/20 hover:bg-brand-error/20' : 'bg-brand-accent text-white hover:bg-brand-accent-plus shadow shadow-brand-accent/20'">
                  {{ isInToGo ? 'Убрать' : 'Добавить' }}
                </button>
              </div>

              <!-- Group card -->
              <div
                v-if="event.group"
                class="bg-brand-card border border-brand-border rounded-3xl p-4 flex items-center gap-3 cursor-pointer hover:border-brand-accent/30 transition-colors"
                @click="router.push({ name: 'group-detail', params: { slugOrId: event.group.slug } })"
              >
                <div class="w-10 h-10 rounded-xl bg-brand-accent/20 overflow-hidden shrink-0">
                  <img v-if="event.group.avatar_url" :src="event.group.avatar_url" class="w-full h-full object-cover" />
                </div>
                <div class="min-w-0">
                  <p class="text-white text-sm font-bold truncate">{{ event.group.name }}</p>
                  <p class="text-white/30 text-xs">Группа-организатор</p>
                </div>
                <BIcon name="ChevronRight" class="w-4 h-4 text-white/20 ml-auto" />
              </div>
            </div>
          </div>
        </template>

        <!-- Not found -->
        <div v-else class="text-center py-16">
          <BIcon name="AlertCircle" class="w-12 h-12 text-brand-error mx-auto mb-4" />
          <p class="text-white/40 text-sm">Событие не найдено</p>
        </div>
      </main>
    </div>

    <!-- SOON Popup -->
    <SoonPopup
      v-if="event"
      :event="event"
      :username="authStore.user?.display_name || authStore.user?.username || 'User'"
      :show="showSoonPopup"
      @confirm="confirmSoon"
      @cancel="showSoonPopup = false"
    />
  </div>
</template>

<style scoped>
.event-fog {
  background: 
    radial-gradient(ellipse at 30% 50%, rgba(76, 103, 207, 0.15) 0%, transparent 60%),
    radial-gradient(ellipse at 70% 50%, rgba(205, 131, 245, 0.1) 0%, transparent 60%);
  animation: fog-drift 8s ease-in-out infinite alternate;
}
@keyframes fog-drift {
  from { opacity: 0.6; transform: scale(1); }
  to { opacity: 1; transform: scale(1.05); }
}
</style>
