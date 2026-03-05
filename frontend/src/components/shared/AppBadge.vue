<script setup lang="ts">
/**
 * AppBadge — universal status badge for Users (artist experience) and Groups (member tier).
 *
 * Props:
 *   type  — 'user' | 'group'
 *   level — UserBadgeLevel | GroupBadgeLevel string (e.g. 'green', 'gold', 'diamond')
 *   size  — 'sm' | 'md' (default 'sm')
 */

defineProps<{
  type: 'user' | 'group'
  level: string
  size?: 'sm' | 'md'
}>()

const userMeta: Record<string, { label: string; color: string; border: string; bg: string }> = {
  beginner:  { label: 'Новичок',    color: 'text-gray-400',   border: 'border-gray-500/40',   bg: 'bg-gray-500/15' },
  green:     { label: '1+ год',     color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/15' },
  blue:      { label: '3+ года',    color: 'text-blue-400',    border: 'border-blue-500/40',    bg: 'bg-blue-500/15' },
  gold:      { label: '5+ лет',     color: 'text-amber-400',   border: 'border-amber-500/40',   bg: 'bg-amber-500/15' },
  platinum:  { label: '10+ лет',    color: 'text-purple-300',  border: 'border-purple-400/40',  bg: 'bg-purple-500/15' },
}

const groupMeta: Record<string, { label: string; color: string; border: string; bg: string }> = {
  bronze:  { label: 'Bronze',  color: 'text-orange-400',  border: 'border-orange-500/40',  bg: 'bg-orange-500/15' },
  silver:  { label: 'Silver',  color: 'text-gray-300',    border: 'border-gray-400/40',    bg: 'bg-gray-400/15' },
  gold:    { label: 'Gold',    color: 'text-amber-400',   border: 'border-amber-500/40',   bg: 'bg-amber-500/15' },
  diamond: { label: 'Diamond', color: 'text-cyan-300',    border: 'border-cyan-400/40',    bg: 'bg-cyan-400/15' },
}
</script>

<template>
  <span
    v-if="level && level !== 'none'"
    class="app-badge inline-flex items-center gap-1 rounded-lg font-extrabold uppercase tracking-widest border select-none whitespace-nowrap"
    :class="[
      size === 'md' ? 'text-[11px] px-2.5 py-1' : 'text-[10px] px-2 py-0.5',
      (type === 'user' ? userMeta[level] : groupMeta[level])?.bg,
      (type === 'user' ? userMeta[level] : groupMeta[level])?.border,
      (type === 'user' ? userMeta[level] : groupMeta[level])?.color,
    ]"
    :title="(type === 'user' ? userMeta[level] : groupMeta[level])?.label"
  >
    <!-- User artist SVG icons -->
    <template v-if="type === 'user'">
      <!-- Beginner — seedling -->
      <svg v-if="level === 'beginner'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 20h10"/>
        <path d="M10 20c5.5-2.5.8-6.4 3-10"/>
        <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/>
        <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>
      </svg>
      <!-- Green — palette -->
      <svg v-else-if="level === 'green'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
      </svg>
      <!-- Blue — brush -->
      <svg v-else-if="level === 'blue'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/>
        <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>
      </svg>
      <!-- Gold — award -->
      <svg v-else-if="level === 'gold'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="6"/>
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
      </svg>
      <!-- Platinum — gem -->
      <svg v-else-if="level === 'platinum'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 3h12l4 6-10 13L2 9Z"/>
        <path d="M11 3 8 9l4 13 4-13-3-6"/>
        <path d="M2 9h20"/>
      </svg>
    </template>

    <!-- Group tier SVG icons -->
    <template v-else>
      <!-- Bronze — shield -->
      <svg v-if="level === 'bronze'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
      </svg>
      <!-- Silver — shield + star -->
      <svg v-else-if="level === 'silver'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
        <path d="m12 8 1.09 2.41L15.5 11l-1.79 1.47.5 2.53L12 13.84 9.79 15l.5-2.53L8.5 11l2.41-.59z"/>
      </svg>
      <!-- Gold — trophy -->
      <svg v-else-if="level === 'gold'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
        <path d="M4 22h16"/>
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/>
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/>
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
      </svg>
      <!-- Diamond — gem -->
      <svg v-else-if="level === 'diamond'" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 3h12l4 6-10 13L2 9Z"/>
        <path d="M11 3 8 9l4 13 4-13-3-6"/>
        <path d="M2 9h20"/>
      </svg>
    </template>

    <span>{{ (type === 'user' ? userMeta[level] : groupMeta[level])?.label }}</span>
  </span>
</template>

<style scoped>
.app-badge {
  backdrop-filter: blur(4px);
  box-shadow: 0 0 8px rgba(76, 103, 207, 0.08);
}
</style>
