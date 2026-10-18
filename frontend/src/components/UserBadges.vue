<script setup lang="ts">
import { computed } from 'vue'
import { Crown, Shield, Sparkles } from 'lucide-vue-next'
import VerificationBadge from '@/components/VerificationBadge.vue'
import { useLangStore } from '@/stores/lang'

// Значки рядом с ником (как в профиле): верификация, роль администрации и платная подписка.
interface BadgeUser {
  is_verified?: boolean | null
  verification_type?: string | null
  badge_type?: string | null
  role?: string | null
  subscription_tier?: string | null
}

const props = withDefaults(defineProps<{ user?: BadgeUser | null; size?: 'sm' | 'md' }>(), { size: 'sm' })
const langStore = useLangStore()

const role = computed(() => {
  const r = props.user?.badge_type ?? props.user?.role
  return r === 'admin' || r === 'moderator' ? r : null
})
const tier = computed(() => {
  const t = props.user?.subscription_tier
  return t === 'lite' || t === 'pro' || t === 'business' ? t : null
})
const iconCls = computed(() => (props.size === 'md' ? 'w-5 h-5' : 'w-4 h-4'))
</script>

<template>
  <span v-if="user?.is_verified || role || tier" class="inline-flex items-center gap-1 shrink-0 align-middle">
    <VerificationBadge v-if="user?.is_verified" :type="user?.verification_type" :icon-class="iconCls + ' shrink-0'" />
    <span v-if="role === 'admin'" class="inline-flex items-center justify-center rounded-md bg-amber-500/25 border border-amber-500/40 text-amber-300 p-0.5"
      :title="langStore.t.roleAdmin">
      <Crown :class="size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'" />
    </span>
    <span v-else-if="role === 'moderator'" class="inline-flex items-center justify-center rounded-md bg-purple-500/25 border border-purple-500/40 text-purple-300 p-0.5"
      :title="langStore.t.profileRoleModerator">
      <Shield :class="size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'" />
    </span>
    <span v-if="tier" class="inline-flex items-center gap-0.5 px-1 rounded-md text-[9px] font-extrabold uppercase tracking-wider border leading-4"
      :class="{
        'bg-brand-accent/15 border-brand-accent/40 text-brand-accent': tier === 'lite',
        'bg-violet-500/15 border-violet-500/40 text-violet-300': tier === 'pro',
        'bg-amber-500/15 border-amber-500/40 text-amber-400': tier === 'business',
      }">
      <Sparkles class="w-2 h-2" />{{ tier === 'lite' ? 'Lite' : tier === 'pro' ? 'Pro' : 'Business' }}
    </span>
  </span>
</template>
