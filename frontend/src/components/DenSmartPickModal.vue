<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import BIcon from './BIcon.vue'
import { useLangStore } from '@/stores/lang'
import { BUDGET_CURRENCIES, emptySmartPick, type SmartPick } from '@/lib/smartPick'

// «Умный подбор»: несколько вопросов — и каталог сам настраивает фильтры. Оболочка как у CreateGroupModal.
const props = defineProps<{
  modelValue: SmartPick
  cats: { key: string; label: string; icon: string }[]
  kinds: { key: string; label: string; icon: string; hint: string }[]
  sorts: { key: string; label: string }[]
  defaultCurrency: string
}>()
const emit = defineEmits<{ apply: [value: SmartPick]; close: [] }>()
const langStore = useLangStore()
const t = computed(() => langStore.t as Record<string, string>)

const draft = ref<SmartPick>({ ...props.modelValue })
const formats = computed(() => [
  { key: '', label: t.value.dealersDenSmartAny, icon: 'Globe' },
  { key: 'digital', label: t.value.dealersDenTypeDigital, icon: 'Download' },
  { key: 'physical', label: t.value.dealersDenTypePhysical, icon: 'Package' },
])

const numOrNull = (v: unknown) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v))
const budgetError = computed(() => {
  const { budgetMin: a, budgetMax: b } = draft.value
  return a !== null && b !== null && a > b ? t.value.dealersDenSmartBudgetError : ''
})

function reset() { draft.value = emptySmartPick(props.defaultCurrency) }
function apply() { if (!budgetError.value) emit('apply', { ...draft.value }) }

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

const chip = (on: boolean) => on
  ? 'bg-brand-accent/20 border-brand-accent text-brand-accent'
  : 'bg-brand-bg border-brand-border text-white/55 hover:text-white hover:border-white/20'
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" @click.self="emit('close')">
      <div role="dialog" aria-modal="true" aria-labelledby="den-smart-title"
        class="relative bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        <div class="relative px-6 pt-6 pb-4 shrink-0">
          <button type="button" @click="emit('close')" class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors z-20">
            <BIcon name="X" class="w-4 h-4 text-white/50" />
          </button>
          <h2 id="den-smart-title" class="text-xl font-extrabold text-white mb-1 flex items-center gap-2">
            <BIcon name="Sparkles" class="w-5 h-5 text-brand-accent" /> {{ t.dealersDenSmartTitle }}
          </h2>
          <p class="text-white/40 text-xs">{{ t.dealersDenSmartSub }}</p>
        </div>

        <div class="flex-1 overflow-y-auto px-6 pb-4 stack-y-5">
          <!-- 1. Что ищете -->
          <div>
            <p class="text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ t.dealersDenSmartWhat }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="c in cats" :key="c.key" type="button" @click="draft.category = c.key"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all" :class="chip(draft.category === c.key)">
                <BIcon :name="c.icon" class="w-3 h-3" />{{ c.key === 'all' ? t.dealersDenSmartAny : c.label }}
              </button>
            </div>
          </div>

          <!-- 2. Формат -->
          <div>
            <p class="text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ t.dealersDenSmartFormat }}</p>
            <div class="grid grid-cols-3 gap-2">
              <button v-for="f in formats" :key="f.key" type="button" @click="draft.type = f.key as any"
                class="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-bold border transition-all" :class="chip(draft.type === f.key)">
                <BIcon :name="f.icon" class="w-3.5 h-3.5" />{{ f.label }}
              </button>
            </div>
          </div>

          <!-- 3. Как купить -->
          <div>
            <p class="text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ t.dealersDenSmartHow }}</p>
            <div class="grid grid-cols-2 gap-2">
              <button v-for="k in kinds" :key="k.key" type="button" @click="draft.kind = k.key"
                class="text-left px-3 py-2.5 rounded-2xl border transition-all" :class="chip(draft.kind === k.key)">
                <span class="flex items-center gap-1.5 text-xs font-bold"><BIcon :name="k.icon" class="w-3.5 h-3.5" />{{ k.key === '' ? t.dealersDenSmartAny : k.label }}</span>
                <span class="block text-[10px] font-medium opacity-60 mt-0.5 leading-tight">{{ k.hint }}</span>
              </button>
            </div>
          </div>

          <!-- 4. Бюджет -->
          <div>
            <p class="text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ t.dealersDenSmartBudget }}</p>
            <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input :value="draft.budgetMin ?? ''" @input="draft.budgetMin = numOrNull(($event.target as HTMLInputElement).value)" type="number" min="0" :placeholder="t.dealersDenSmartFrom"
                class="w-full rounded-2xl px-4 py-2.5 text-sm text-white outline-hidden bg-brand-bg border border-brand-border focus:border-brand-accent" />
              <input :value="draft.budgetMax ?? ''" @input="draft.budgetMax = numOrNull(($event.target as HTMLInputElement).value)" type="number" min="0" :placeholder="t.dealersDenSmartTo"
                class="w-full rounded-2xl px-4 py-2.5 text-sm text-white outline-hidden bg-brand-bg border border-brand-border focus:border-brand-accent" />
              <select v-model="draft.budgetCurrency" class="rounded-2xl px-3 py-2.5 text-sm text-white outline-hidden bg-brand-bg border border-brand-border appearance-none cursor-pointer">
                <option v-for="c in BUDGET_CURRENCIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <p v-if="budgetError" class="text-[11px] text-brand-error mt-1.5">{{ budgetError }}</p>
            <p v-else class="text-[11px] text-white/30 mt-1.5">{{ t.dealersDenSmartBudgetHint }}</p>
            <button type="button" @click="draft.onlyDiscount = !draft.onlyDiscount"
              class="mt-3 w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border text-xs font-bold transition-all"
              :class="draft.onlyDiscount ? 'border-rose-400/60 bg-rose-500/10 text-rose-300' : 'bg-brand-bg border-brand-border text-white/55 hover:text-white'">
              <span class="flex items-center gap-2"><BIcon name="Tag" class="w-3.5 h-3.5" />{{ t.dealersDenSmartOnlyDiscount }}</span>
              <span class="w-9 h-5 rounded-full relative transition-colors" :class="draft.onlyDiscount ? 'bg-rose-500' : 'bg-white/15'">
                <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="draft.onlyDiscount ? 'left-[18px]' : 'left-0.5'" />
              </span>
            </button>
          </div>

          <!-- 5. Сортировка -->
          <div>
            <p class="text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ t.dealersDenSmartSort }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="s in sorts" :key="s.key" type="button" @click="draft.sort = s.key"
                class="px-3 py-1.5 rounded-full text-xs font-bold border transition-all" :class="chip(draft.sort === s.key)">{{ s.label }}</button>
            </div>
          </div>
        </div>

        <div class="flex gap-3 px-6 py-4 border-t border-brand-border shrink-0">
          <button type="button" @click="reset"
            class="px-5 py-3 border border-white/8 text-white/50 text-sm font-bold rounded-2xl transition-all hover:bg-white/5 hover:text-white">{{ t.dealersDenSmartReset }}</button>
          <button type="button" @click="apply" :disabled="!!budgetError"
            class="flex-1 flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-2xl transition-all shadow-lg hover:opacity-90 disabled:opacity-40"
            :class="'bg-brand-gradient'">
            <BIcon name="Search" class="w-4 h-4" />{{ t.dealersDenSmartShow }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
