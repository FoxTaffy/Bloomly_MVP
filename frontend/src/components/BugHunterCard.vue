<template>
  <div class="rounded-3xl border p-4 transition-all" :class="theme.card">
    <div class="flex items-center gap-3">
      <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border" :class="theme.icon">
        <BIcon :name="hunter.level === 3 ? 'Crown' : 'Bug'" class="w-6 h-6" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[10px] font-bold uppercase tracking-widest text-white/45">{{ t.bugHunterTitle }}</p>
        <p class="text-sm font-extrabold text-white leading-tight truncate">{{ levelTitle }}</p>
      </div>
    </div>

    <p class="text-xs text-white/60 mt-3">{{ hunter.nextTarget === null ? t.bugHunterDescMax : t.bugHunterDesc }}</p>

    <div class="mt-3">
      <div class="flex items-center justify-between text-[11px] font-bold mb-1.5">
        <span class="text-white/80">{{ counter }}</span>
        <span v-if="nextTitle" class="text-white/40 truncate ml-2">{{ nextTitle }}</span>
      </div>
      <div class="w-full bg-brand-border rounded-full h-2 overflow-hidden"
        role="progressbar" :aria-valuenow="hunter.count" aria-valuemin="0" :aria-valuemax="hunter.nextTarget ?? hunter.count">
        <div class="h-full rounded-full transition-all duration-500" :class="theme.bar" :style="{ width: percent + '%' }" />
      </div>
    </div>

    <router-link v-if="isOwn" to="/help"
      class="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-accent hover:underline">
      <BIcon name="Bug" class="w-3 h-3" /> {{ t.bugHunterReport }}
    </router-link>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useLangStore } from '@/stores/lang'
import type { UserProfile } from '@/stores/user'

const props = defineProps<{
  hunter: NonNullable<UserProfile['bug_hunter']>
  isOwn?: boolean
}>()

const langStore = useLangStore()
// computed, чтобы подписи менялись при смене языка без перезагрузки
const t = computed(() => langStore.t)

const LEVEL_THEME = [
  { card: 'bg-brand-bg/60 border-brand-border', icon: 'bg-white/5 border-white/10 text-white/40', bar: 'bg-white/40' },
  { card: 'bg-violet-500/8 border-violet-500/25', icon: 'bg-violet-500/20 border-violet-400/30 text-violet-300', bar: 'bg-violet-400' },
  { card: 'bg-cyan-500/8 border-cyan-500/25', icon: 'bg-cyan-500/20 border-cyan-400/30 text-cyan-300', bar: 'bg-cyan-400' },
  { card: 'bg-amber-500/8 border-amber-500/30', icon: 'bg-amber-500/20 border-amber-400/40 text-amber-300', bar: 'bg-amber-400' },
]

const levelTitles = computed(() => [t.value.bugHunterLvl0, t.value.bugHunterLvl1, t.value.bugHunterLvl2, t.value.bugHunterHacker])
const theme = computed(() => LEVEL_THEME[props.hunter.level])
const levelTitle = computed(() => levelTitles.value[props.hunter.level])
const nextTitle = computed(() => props.hunter.nextTarget === null ? '' : t.value.bugHunterNext.replace('{level}', levelTitles.value[props.hunter.level + 1]))
const counter = computed(() => props.hunter.nextTarget === null
  ? `${props.hunter.count} ${t.value.bugHunterUnit}`
  : `${props.hunter.count}/${props.hunter.nextTarget} ${t.value.bugHunterUnit}`)
const percent = computed(() => props.hunter.nextTarget === null
  ? 100
  : Math.min(100, Math.round((props.hunter.count / props.hunter.nextTarget) * 100)))
</script>
