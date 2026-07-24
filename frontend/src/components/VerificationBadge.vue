<template>
  <span class="inline-flex" @mouseenter="onEnter" @mouseleave="onLeave">
    <img :src="verificationBadgeIcon(type)" :class="imgClass" title="" />
  </span>

  <Teleport to="body">
    <Transition name="verbadge-fade">
      <div
        v-if="show"
        class="fixed z-[9999] w-64 bg-brand-card border border-brand-border rounded-2xl shadow-2xl p-3.5"
        :style="{ top: pos.top, left: pos.left }"
        @mouseenter="onEnter"
        @mouseleave="onLeave"
      >
        <div class="flex items-center gap-2 mb-1.5">
          <img :src="verificationBadgeIcon(type)" class="w-6 h-6 flex-shrink-0" />
          <span class="font-bold text-white text-sm leading-tight">{{ info.label }}</span>
        </div>
        <p class="text-xs text-white/55 leading-relaxed mb-2.5">{{ info.desc }}</p>
        <router-link
          :to="{ name: 'settings-profile', query: { section: 'sec-verification' } }"
          class="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
        >
          Подать заявку на верификацию →
        </router-link>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { verificationBadgeIcon, verificationTypeInfo } from '@/composables/useVerificationBadge'

const props = defineProps<{
  type?: string | null
  imgClass?: string
}>()

const info = verificationTypeInfo(props.type)
const show = ref(false)
const pos = ref({ top: '0px', left: '0px' })
let hideTimer: ReturnType<typeof setTimeout> | null = null

function onEnter(e: MouseEvent) {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  const target = e.currentTarget as HTMLElement
  // Popover positioning is only meaningful when triggered from the badge itself,
  // not from re-entering the popover — reuse the last computed position then.
  if (target.tagName === 'SPAN') {
    const rect = target.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 256 - 8))
    pos.value = { top: `${rect.bottom + 8}px`, left: `${left}px` }
  }
  show.value = true
}

function onLeave() {
  hideTimer = setTimeout(() => { show.value = false }, 120)
}
</script>

<style scoped>
.verbadge-fade-enter-active,
.verbadge-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.verbadge-fade-enter-from,
.verbadge-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
