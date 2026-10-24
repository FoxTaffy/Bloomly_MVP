<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'

// Шапка витрин (Магазин, Dealers' Den): плашка с названием, подзаголовком, блоком справа и счётчиками.
defineProps<{
  title: string
  subtitle?: string
  icon: string
  /** цвет основного свечения: purple — Магазин, accent — Dealers' Den */
  tone?: 'purple' | 'accent'
  stats?: { icon: string; label: string; value: number | string }[]
}>()
</script>

<template>
  <div class="relative overflow-hidden rounded-3xl shadow-2xl border border-brand-border bg-linear-to-br via-brand-bg"
    :class="tone === 'accent' ? 'from-brand-accent/25 to-brand-accent-minus/10' : 'from-brand-purple/20 to-brand-accent/20'">
    <div class="absolute -top-10 -left-10 w-64 h-64 rounded-full blur-3xl pointer-events-none"
      :class="tone === 'accent' ? 'bg-brand-accent/35' : 'bg-brand-purple/30'" />
    <div class="absolute -bottom-10 right-16 w-56 h-56 rounded-full bg-brand-accent/25 blur-3xl pointer-events-none" />
    <div class="absolute top-4 right-4 w-36 h-36 rounded-full bg-brand-yellow/15 blur-2xl pointer-events-none" />

    <div class="relative z-10 px-6 py-7 max-md:px-4 max-md:py-5">
      <div class="flex items-start justify-between gap-4 max-md:flex-col">
        <div class="flex-1 min-w-0 max-md:w-full">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-12 h-12 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-lg shrink-0">
              <BIcon :name="icon" class="w-6 h-6 text-white" />
            </div>
            <div class="min-w-0">
              <h1 class="text-3xl max-md:text-2xl font-black tracking-tight">{{ title }}</h1>
              <p v-if="subtitle" class="text-white/50 text-xs mt-0.5 font-medium">{{ subtitle }}</p>
            </div>
          </div>
          <p v-if="$slots.tagline" class="text-white/70 text-sm max-w-md leading-relaxed"><slot name="tagline" /></p>
        </div>
        <div v-if="$slots.side" class="flex flex-col gap-2 shrink-0 w-60 max-md:w-full"><slot name="side" /></div>
      </div>

      <div v-if="stats?.length" class="grid grid-cols-2 md:flex gap-2 md:gap-3 mt-5">
        <div v-for="s in stats" :key="s.label"
          class="flex items-center gap-2 bg-white/8 backdrop-blur-xs border border-white/10 rounded-2xl px-4 py-2 max-md:px-3 min-w-0">
          <BIcon :name="s.icon" class="w-3.5 h-3.5 text-brand-accent-minus shrink-0" />
          <span class="text-white font-extrabold text-sm tabular-nums">{{ s.value }}</span>
          <span class="text-white/45 text-xs truncate">{{ s.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
