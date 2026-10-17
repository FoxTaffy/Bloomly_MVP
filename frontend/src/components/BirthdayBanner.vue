<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useFriendsStore, type NearbyBirthday } from '@/stores/friends'
import { onAvatarError } from '@/composables/useAvatarFallback'
import BIcon from '@/components/BIcon.vue'

const emit = defineEmits<{ (e: 'message', userId: string): void }>()

const router = useRouter()
const friendsStore = useFriendsStore()

const items = computed(() => friendsStore.nearbyBirthdays)
const index = ref(0)
const direction = ref<'next' | 'prev'>('next')

let autoplayTimer: ReturnType<typeof setInterval> | null = null

function startAutoplay() {
  stopAutoplay()
  if (items.value.length < 2) return
  autoplayTimer = setInterval(() => next(), 5000)
}
function stopAutoplay() {
  if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null }
}

function next() {
  direction.value = 'next'
  index.value = (index.value + 1) % items.value.length
}
function prev() {
  direction.value = 'prev'
  index.value = (index.value - 1 + items.value.length) % items.value.length
}
function goTo(i: number) {
  direction.value = i > index.value ? 'next' : 'prev'
  index.value = i
}

const current = computed<NearbyBirthday | undefined>(() => items.value[index.value])

watch(items, (list) => {
  if (index.value >= list.length) index.value = 0
  startAutoplay()
})

onMounted(async () => {
  await friendsStore.loadNearbyBirthdays()
  startAutoplay()
})
onUnmounted(stopAutoplay)

function yearsWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'год'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'года'
  return 'лет'
}

function dayLabel(offset: number): string {
  if (offset === 0) return 'Сегодня'
  if (offset === 1) return 'Завтра'
  return 'Вчера'
}

function ageLine(item: NearbyBirthday): string {
  const w = yearsWord(item.age)
  if (item.daysOffset === 0)  return `Сегодня исполняется ${item.age} ${w}`
  if (item.daysOffset === 1)  return `Завтра исполнится ${item.age} ${w}`
  return `Вчера исполнилось ${item.age} ${w}`
}

function openProfile(item: NearbyBirthday) {
  router.push(`/profile/${item.username}`)
}
</script>

<template>
  <div
    v-if="current"
    class="relative mx-3 mt-3 mb-1 shrink-0 rounded-2xl overflow-hidden border border-brand-accent/25 bg-linear-to-br/srgb from-brand-accent/20 via-brand-purple/10 to-brand-card shadow-lg"
    @mouseenter="stopAutoplay"
    @mouseleave="startAutoplay"
  >
    <!-- Decorative glow -->
    <div class="absolute -top-8 -right-6 w-24 h-24 rounded-full bg-brand-accent/25 blur-2xl pointer-events-none" />
    <div class="absolute -bottom-10 -left-6 w-24 h-24 rounded-full bg-brand-pink/15 blur-2xl pointer-events-none" />

    <Transition :name="direction === 'next' ? 'bday-slide-next' : 'bday-slide-prev'" mode="out-in">
      <div :key="current.id" class="relative flex items-center gap-3 px-4 py-3">
        <!-- Avatar -->
        <div class="relative shrink-0 cursor-pointer" @click="openProfile(current)">
          <img
            v-if="current.avatar_url"
            :src="current.avatar_url"
            :alt="current.display_name || current.username"
            class="w-12 h-12 rounded-full object-cover ring-2 ring-brand-accent/50"
            @error="onAvatarError"
          />
          <div v-else class="w-12 h-12 rounded-full bg-brand-accent/25 ring-2 ring-brand-accent/50 flex items-center justify-center text-brand-accent font-bold">
            {{ (current.display_name || current.username)[0].toUpperCase() }}
          </div>
          <span class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-accent flex items-center justify-center shadow-md text-[13px] leading-none">
            🎂
          </span>
        </div>

        <!-- Text -->
        <div class="min-w-0 flex-1 cursor-pointer" @click="openProfile(current)">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
              :class="current.daysOffset === 0 ? 'bg-brand-accent text-white' : 'bg-white/10 text-white/70'">
              {{ dayLabel(current.daysOffset) }}
            </span>
            <BIcon v-if="current.daysOffset === 0" name="PartyPopper" class="w-3.5 h-3.5 text-brand-accent" />
          </div>
          <p class="text-sm font-bold text-white truncate mt-1 leading-tight">
            {{ current.display_name || current.username }}
          </p>
          <p class="text-xs text-white/60 truncate">{{ ageLine(current) }}</p>
        </div>

        <!-- Message button -->
        <button
          type="button"
          @click.stop="emit('message', current.id)"
          class="shrink-0 p-2 rounded-xl bg-white/10 hover:bg-brand-accent text-white/80 hover:text-white transition-all active:scale-95"
          title="Написать"
        >
          <BIcon name="MessageCircle" class="w-4 h-4" />
        </button>
      </div>
    </Transition>

    <!-- Carousel controls (only when 2+) -->
    <template v-if="items.length > 1">
      <button type="button" @click.stop="prev"
        class="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/30 hover:bg-black/55 backdrop-blur-xs flex items-center justify-center text-white/80 hover:text-white transition-all active:scale-90">
        <BIcon name="ChevronLeft" class="w-3.5 h-3.5" />
      </button>
      <button type="button" @click.stop="next"
        class="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/30 hover:bg-black/55 backdrop-blur-xs flex items-center justify-center text-white/80 hover:text-white transition-all active:scale-90">
        <BIcon name="ChevronRight" class="w-3.5 h-3.5" />
      </button>

      <!-- Dots -->
      <div class="relative flex items-center justify-center gap-1 pb-2">
        <button
          v-for="(item, i) in items" :key="item.id"
          type="button"
          @click.stop="goTo(i)"
          :class="['h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-brand-accent' : 'w-1.5 bg-white/25 hover:bg-white/40']"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.bday-slide-next-enter-active, .bday-slide-next-leave-active,
.bday-slide-prev-enter-active, .bday-slide-prev-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.bday-slide-next-enter-from { opacity: 0; transform: translateX(24px); }
.bday-slide-next-leave-to   { opacity: 0; transform: translateX(-24px); }
.bday-slide-prev-enter-from { opacity: 0; transform: translateX(-24px); }
.bday-slide-prev-leave-to   { opacity: 0; transform: translateX(24px); }
</style>
