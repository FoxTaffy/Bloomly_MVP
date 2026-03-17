<template>
  <div v-if="trust && trust.total_finished > 0 || trust?.is_blacklisted" class="rounded-3xl border p-4 transition-all"
    :class="{
      'bg-brand-success/8 border-brand-success/25': trust?.tier === 'green',
      'bg-brand-yellow/8 border-brand-yellow/25':  trust?.tier === 'yellow',
      'bg-brand-error/8 border-brand-error/25':    trust?.tier === 'red',
      'bg-brand-bg/60 border-brand-border':         trust?.tier === 'none',
    }">

    <!-- Header -->
    <div class="flex items-center gap-3 mb-3">
      <!-- Tier icon -->
      <div class="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
        :class="{
          'bg-brand-success/20': trust?.tier === 'green',
          'bg-brand-yellow/20':  trust?.tier === 'yellow',
          'bg-brand-error/20':   trust?.tier === 'red',
          'bg-brand-border/40':  trust?.tier === 'none',
        }">
        <BIcon :name="tierIcon" class="w-5 h-5"
          :class="{
            'text-brand-success': trust?.tier === 'green',
            'text-brand-yellow':  trust?.tier === 'yellow',
            'text-brand-error':   trust?.tier === 'red',
            'text-white/40':      trust?.tier === 'none',
          }" />
      </div>

      <div class="flex-1 min-w-0">
        <p class="font-bold text-sm text-white">{{ tierLabel }}</p>
        <p class="text-xs text-white/50">Надёжность на интерактивах</p>
      </div>

      <!-- Percent badge -->
      <div v-if="trust?.total_finished > 0"
        class="flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-extrabold"
        :class="{
          'bg-brand-success/20 text-brand-success': trust?.tier === 'green',
          'bg-brand-yellow/20 text-brand-yellow':   trust?.tier === 'yellow',
          'bg-brand-error/20 text-brand-error':     trust?.tier === 'red',
        }">
        {{ trust?.percent }}%
      </div>
    </div>

    <!-- Stats row -->
    <div v-if="trust?.total_finished > 0" class="grid grid-cols-4 gap-2 mb-3">
      <div class="text-center">
        <p class="text-lg font-extrabold text-brand-success">{{ trust?.completed }}</p>
        <p class="text-[10px] text-white/40">Выполнено</p>
      </div>
      <div class="text-center">
        <p class="text-lg font-extrabold text-white/60">{{ trust?.withdrawn }}</p>
        <p class="text-[10px] text-white/40">Отозвано</p>
      </div>
      <div class="text-center">
        <p class="text-lg font-extrabold text-brand-yellow">{{ trust?.delayed }}</p>
        <p class="text-[10px] text-white/40">Задержки</p>
      </div>
      <div class="text-center">
        <p class="text-lg font-extrabold text-brand-error">{{ trust?.fraud }}</p>
        <p class="text-[10px] text-white/40">Нарушения</p>
      </div>
    </div>

    <!-- Progress bar -->
    <div v-if="trust && trust.total_finished > 0" class="w-full bg-brand-border rounded-full h-1.5 overflow-hidden mb-3">
      <div class="h-full rounded-full transition-all duration-500"
        :style="{ width: trust.percent + '%' }"
        :class="{
          'bg-brand-success': trust.tier === 'green',
          'bg-brand-yellow':  trust.tier === 'yellow',
          'bg-brand-error':   trust.tier === 'red',
        }" />
    </div>

    <!-- Blacklist warning -->
    <div v-if="trust?.is_blacklisted"
      class="flex items-start gap-2 bg-brand-error/10 border border-brand-error/20 rounded-xl px-3 py-2 mt-2">
      <BIcon name="ShieldOff" class="w-4 h-4 text-brand-error flex-shrink-0 mt-0.5" />
      <div>
        <p class="text-xs font-bold text-brand-error">В чёрном списке интерактивов</p>
        <p v-if="trust?.blacklist_reason" class="text-[11px] text-brand-error/70 mt-0.5">{{ trust.blacklist_reason }}</p>
      </div>
    </div>

    <!-- First activity note -->
    <div v-else-if="trust?.total_finished === 0"
      class="flex items-center gap-2 opacity-60">
      <BIcon name="Info" class="w-4 h-4 text-white/40" />
      <p class="text-xs text-white/40">Ещё не участвовал в интерактивах</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed, onMounted, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import api from '@/api'

interface TrustScore {
  tier: 'green' | 'yellow' | 'red' | 'none'
  completed: number
  withdrawn: number
  delayed: number
  fraud: number
  total_finished: number
  percent: number
  is_blacklisted: boolean
  blacklist_reason?: string
}

const props = defineProps<{
  userId: string
}>()

const trust = ref<TrustScore | null>(null)

async function load() {
  try {
    const { data } = await api.get(`/activities/trust/${props.userId}`)
    if (data.success) trust.value = data.data.trust
  } catch { /* silent */ }
}

onMounted(load)
watch(() => props.userId, load)

const tierLabel = computed(() => {
  if (trust.value?.is_blacklisted) return 'Чёрный список'
  switch (trust.value?.tier) {
    case 'green':  return 'Надёжный исполнитель'
    case 'yellow': return 'Есть замечания'
    case 'red':    return 'Ненадёжный'
    default:       return 'Новый участник'
  }
})

const tierIcon = computed(() => {
  if (trust.value?.is_blacklisted) return 'ShieldOff'
  switch (trust.value?.tier) {
    case 'green':  return 'ShieldCheck'
    case 'yellow': return 'ShieldAlert'
    case 'red':    return 'ShieldX'
    default:       return 'Shield'
  }
})
</script>
