<template>
  <span class="inline-flex" @mouseenter="onEnter" @mouseleave="onLeave">
    <img v-if="iconUrl" :src="iconUrl" :alt="type ?? ''" :class="iconClass" class="rounded-sm object-cover" />
    <BIcon v-else name="BadgeCheck" :class="iconClass" class="text-brand-accent" />
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
          <img v-if="iconUrl" :src="iconUrl" :alt="type ?? ''" class="w-5 h-5 rounded-sm flex-shrink-0 object-cover" />
          <BIcon v-else name="BadgeCheck" class="w-5 h-5 flex-shrink-0 text-brand-accent" />
          <span class="font-bold text-white text-sm leading-tight">{{ info.label }}</span>
        </div>
        <p class="text-xs text-white/55 leading-relaxed mb-2.5">{{ info.desc }}</p>
        <router-link
          :to="{ name: 'settings-profile', query: { section: 'sec-verification' } }"
          class="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
        >
          {{ langStore.t.verBadgeApplyLink }}
        </router-link>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { verificationBadgeIconUrl, verificationTypeInfo } from '@/composables/useVerificationBadge'
import { useLangStore } from '@/stores/lang'

const props = defineProps<{
  type?: string | null
  iconClass?: string
}>()

const langStore = useLangStore()
const info = computed(() => verificationTypeInfo(langStore.t, props.type))
const iconUrl = computed(() => verificationBadgeIconUrl(props.type))
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
