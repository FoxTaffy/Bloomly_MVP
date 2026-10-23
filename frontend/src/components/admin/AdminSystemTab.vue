<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import AdminAutoModTab from './AdminAutoModTab.vue'
import AdminSettingsTab from './AdminSettingsTab.vue'
import { useAdminContext } from './adminContext'

// AutoMod, журнал действий и настройки платформы — один раздел с двумя видами.
// Настройки меняют работу всего сайта, поэтому их видят только администраторы.
const { systemView, isAdminPlus, badges } = useAdminContext()

const views = computed(() => [
  { key: 'automod' as const, label: 'AutoMod', icon: 'ShieldAlert', color: 'bg-rose-500/20 text-rose-300', badge: badges.automod || 0 },
  ...(isAdminPlus.value ? [{ key: 'settings' as const, label: 'Логи и настройки системы', icon: 'Settings', color: 'bg-brand-accent/20 text-white', badge: 0 }] : []),
])
const current = computed(() => (systemView.value === 'settings' && isAdminPlus.value ? 'settings' : 'automod'))
</script>

<template>
  <div>
    <div class="flex gap-1 mb-5 p-1 rounded-2xl bg-white/4 w-full sm:w-fit overflow-x-auto">
      <button v-for="v in views" :key="v.key" type="button" @click="systemView = v.key"
        class="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-1 sm:flex-none"
        :class="current === v.key ? v.color : 'text-white/40 hover:text-white/70'">
        <BIcon :name="v.icon" class="w-3.5 h-3.5" /> {{ v.label }}
        <span v-if="v.badge" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">{{ v.badge }}</span>
      </button>
    </div>
    <KeepAlive>
      <component :is="current === 'settings' ? AdminSettingsTab : AdminAutoModTab" />
    </KeepAlive>
  </div>
</template>
