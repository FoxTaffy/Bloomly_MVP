<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-999 flex items-center justify-center p-4" @click.self="emit('close')">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-xs" />
      <div class="relative bg-brand-card border border-brand-border rounded-3xl p-6 max-w-sm w-full shadow-2xl z-10">
        <button class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors z-20"
          @click="emit('close')">
          <BIcon name="X" class="w-4 h-4 text-white/50" />
        </button>

        <div class="flex items-center gap-3 mb-5 pr-10">
          <div class="bg-brand-gradient w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-lg">
            <BIcon name="Clock" class="w-5 h-5 text-white" />
          </div>
          <div class="min-w-0">
            <h2 class="text-xl font-extrabold text-white leading-tight">{{ paymentConfirm ? 'Подтвердить оплату' : 'Начать работу' }}</h2>
            <p class="text-white/40 text-xs truncate">{{ order.title }}</p>
          </div>
        </div>

        <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-2">
          Дедлайн <span class="text-brand-accent">*</span>
        </label>
        <input v-model="date" type="date" :min="today"
          class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-accent focus:outline-hidden transition-colors" />

        <div class="flex flex-wrap gap-1.5 mt-3">
          <button v-for="d in quick" :key="d" type="button" @click="date = addDays(d)"
            class="text-[11px] font-bold px-3 py-1 rounded-full border border-brand-border bg-white/4 text-white/60 hover:text-white hover:border-brand-accent/50 transition-colors">
            +{{ d }} дн.
          </button>
        </div>

        <p v-if="avgDays" class="mt-4 text-[11px] text-white/45 leading-relaxed rounded-xl bg-white/4 border border-white/6 px-3 py-2.5">
          <BIcon name="TrendingUp" class="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-brand-accent" />
          Обычно вы делаете заказ за <b class="text-white/75">{{ avgDays }} дн.</b> — поставьте срок с запасом.
        </p>
        <p v-else class="mt-4 text-[11px] text-white/35 leading-relaxed">
          Срок ставите вы сами. После 5 готовых работ здесь появится ваша реальная средняя скорость.
        </p>

        <p v-if="error" class="mt-3 text-xs text-brand-error bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ error }}</p>

        <div class="flex gap-3 mt-5">
          <button class="px-5 py-3 rounded-2xl bg-brand-bg border border-brand-border text-white/60 font-bold text-sm hover:bg-brand-border/50 transition-colors"
            @click="emit('close')">Отмена</button>
          <button class="bg-brand-gradient flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-extrabold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed" :disabled="!date || busy" @click="submit">
            <span v-if="busy" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <BIcon v-else name="Play" class="w-4 h-4" />
            {{ paymentConfirm ? 'Подтвердить и начать' : 'Начать' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BIcon from '@/components/BIcon.vue'
import type { Order } from '@/stores/groups'

const props = defineProps<{ order: Order; avgDays: number | null; busy?: boolean; error?: string; paymentConfirm?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm', deadlineAt: string): void }>()

const quick = [3, 7, 14, 30]
const pad = (n: number) => String(n).padStart(2, '0')
const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = fmtLocal(new Date())
function addDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return fmtLocal(d) }

// Подставляем пожелание заказчика, если он указал срок; иначе — неделя
const date = ref(props.order.deadline_at ? fmtLocal(new Date(props.order.deadline_at)) : addDays(7))

function submit() {
  // конец выбранного дня по местному времени
  const [y, m, d] = date.value.split('-').map(Number)
  emit('confirm', new Date(y, m - 1, d, 23, 59, 0).toISOString())
}
</script>
