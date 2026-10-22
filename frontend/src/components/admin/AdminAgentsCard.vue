<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { useAdminContext, type AdminTab } from './adminContext'

// Субагенты вкладок админки: каждый следит за очередью своей вкладки (жалобы, поддержка, реклама, верификация)
interface AgentStatus { id: string; tab: AdminTab; title: string; level: 'ok' | 'info' | 'warn' | 'alert'; summary: string }

const { switchTab } = useAdminContext()
const agents = ref<AgentStatus[]>([])
const failed = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

const TONE: Record<AgentStatus['level'], string> = {
  ok: 'bg-emerald-400',
  info: 'bg-blue-400',
  warn: 'bg-amber-400',
  alert: 'bg-rose-500',
}

const load = async () => {
  try {
    const res = await api.get('/agents')
    agents.value = res.data?.data?.agents ?? []
    failed.value = false
  } catch { failed.value = true }
}

onMounted(() => { load(); timer = setInterval(load, 60_000) })
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <section v-if="agents.length" class="mb-5 rounded-2xl border border-brand-border bg-brand-card p-4">
    <header class="flex items-center gap-2 mb-3">
      <BIcon name="Bot" class="w-4 h-4 text-white/50" />
      <h3 class="text-sm font-extrabold text-white">Агенты вкладок</h3>
      <span v-if="failed" class="text-[11px] text-rose-400">данные устарели</span>
    </header>
    <ul class="grid grid-cols-1 md:grid-cols-2 gap-2">
      <li v-for="a in agents" :key="a.id">
        <button @click="switchTab(a.tab)"
          class="w-full text-left flex items-start gap-2.5 rounded-xl px-3 py-2 bg-white/3 hover:bg-white/6 border border-white/5 transition-colors">
          <span class="mt-1.5 w-2 h-2 rounded-full shrink-0" :class="TONE[a.level]" />
          <span class="min-w-0">
            <span class="block text-xs font-bold text-white/80">{{ a.title }}</span>
            <span class="block text-[11px] text-white/45 wrap-break-word">{{ a.summary }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
