<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useGroupsStore, type GroupTransaction } from '@/stores/groups'

const props = defineProps<{
  groupId: string
  groupSlug: string
  donationsEnabled: boolean
}>()

const router = useRouter()
const groupsStore = useGroupsStore()
const loading = ref(false)
const balance = ref(0)
const transactions = ref<GroupTransaction[]>([])

async function load() {
  if (!props.groupId || !props.donationsEnabled) return
  loading.value = true
  try {
    const result = await groupsStore.getGroupBalance(props.groupId)
    balance.value = Number(result.balance)
    transactions.value = result.transactions
  } finally {
    loading.value = false
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

watch(() => props.groupId, load)
onMounted(load)
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
    <div class="px-6 py-5 border-b border-brand-border flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center shrink-0">
        <BIcon name="Wallet" class="w-5 h-5 text-brand-accent" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-extrabold text-white">Баланс</h1>
        <p class="text-xs text-white/40">Донаты участников группе</p>
      </div>
    </div>

    <div v-if="!donationsEnabled" class="px-6 py-16 text-center stack-y-3">
      <BIcon name="Wallet" class="w-8 h-8 text-white/20 mx-auto" />
      <p class="text-white/40 text-sm">Донаты не включены для этой группы</p>
      <button @click="router.push({ name: 'group-settings', params: { slugOrId: groupSlug } })"
        class="text-brand-accent text-sm hover:underline">Включить в настройках</button>
    </div>

    <div v-else-if="loading" class="px-6 py-16 flex justify-center">
      <div class="w-8 h-8 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
    </div>

    <div v-else class="p-6 stack-y-5">
      <!-- Balance hero -->
      <div class="relative overflow-hidden rounded-2xl bg-linear-to-br/srgb from-brand-accent/20 to-brand-accent-plus/20 border border-brand-accent/25 p-6 text-center">
        <p class="text-xs font-bold text-brand-accent uppercase tracking-widest mb-2">Баланс группы</p>
        <p class="text-4xl font-extrabold text-white leading-none">{{ balance.toFixed(2) }}</p>
        <p class="flex items-center justify-center gap-1 text-sm text-brand-accent-minus font-semibold mt-1">
          <BIcon name="Flower2" class="w-3.5 h-3.5" /> Blooms
        </p>
      </div>

      <p class="text-[11px] text-white/30 text-center">
        Пополняется донатами от участников через их личный кошелёк — реальных денег не списывается, вывод пока недоступен
      </p>

      <!-- Transactions -->
      <div>
        <p class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 px-1">Последние транзакции</p>
        <div v-if="!transactions.length" class="text-center py-8 text-white/30 text-sm">Пока нет донатов</div>
        <div v-else class="stack-y-1.5">
          <div v-for="tx in transactions" :key="tx.id"
            class="flex items-center gap-3 bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5">
            <img v-if="tx.user?.avatar_url" :src="tx.user.avatar_url" class="w-8 h-8 rounded-full object-cover shrink-0" />
            <div v-else class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-xs font-bold text-brand-accent shrink-0">
              {{ (tx.user?.display_name || tx.user?.username || '?')[0].toUpperCase() }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-white truncate">{{ tx.user?.display_name || tx.user?.username || 'Аноним' }}</p>
              <p v-if="tx.message" class="text-[11px] text-white/40 truncate">{{ tx.message }}</p>
              <p class="text-[10px] text-white/30">{{ fmtDate(tx.created_at) }}</p>
            </div>
            <span class="inline-flex items-center gap-1 text-sm font-bold text-brand-success shrink-0">
              +{{ Number(tx.amount).toFixed(2) }} <BIcon name="Flower2" class="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
