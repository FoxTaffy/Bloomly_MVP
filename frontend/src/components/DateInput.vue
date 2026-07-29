<template>
  <div>
    <div class="flex items-center gap-1.5" :class="{ 'date-shake': shaking }">
      <template v-for="(field, i) in fieldOrder.order" :key="field">
        <span v-if="i > 0" class="text-white/25 font-bold select-none">{{ fieldOrder.separator }}</span>
        <input
          :ref="(el) => setRef(field, el as HTMLInputElement | null)"
          v-model="values[field]"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          :maxlength="field === 'year' ? 4 : 2"
          :placeholder="placeholders[field]"
          class="date-part text-center"
          :class="[field === 'year' ? 'w-20' : 'w-14', isInvalid ? '!border-rose-500 !text-rose-400' : '']"
          @input="onFieldInput(field, i)"
          @keydown.backspace="onFieldBackspace(field, i, $event)"
        />
      </template>
      <BIcon name="Calendar" class="w-4 h-4 text-white/25 ml-1 flex-shrink-0" />
    </div>
    <p v-if="isInvalid" class="text-[11px] text-rose-400 mt-1">{{ invalidReason }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useLangStore, DATE_FIELD_ORDER, type DateField } from '@/stores/lang'

const props = defineProps<{ modelValue: string | null; max?: string }>()
const emit = defineEmits<{ 'update:modelValue': [val: string | null]; invalid: [boolean] }>()

const langStore = useLangStore()

const fieldOrder = computed(() => DATE_FIELD_ORDER[langStore.currentLang])

const placeholders = computed<Record<DateField, string>>(() =>
  langStore.currentLang === 'RU'
    ? { day: 'ДД', month: 'ММ', year: 'ГГГГ' }
    : { day: 'DD', month: 'MM', year: 'YYYY' }
)

const values = reactive<Record<DateField, string>>({ day: '', month: '', year: '' })
const refs: Partial<Record<DateField, HTMLInputElement | null>> = {}
function setRef(field: DateField, el: HTMLInputElement | null) { refs[field] = el }

function syncFromModel(v: string | null) {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-')
    values.year = y; values.month = m; values.day = d
  } else {
    values.year = ''; values.month = ''; values.day = ''
  }
}

watch(() => props.modelValue, syncFromModel, { immediate: true })

function onlyDigits(v: string): string { return v.replace(/\D/g, '') }

function onFieldInput(field: DateField, i: number) {
  const maxLen = field === 'year' ? 4 : 2
  values[field] = onlyDigits(values[field]).slice(0, maxLen)
  if (values[field].length === maxLen) {
    const nextField = fieldOrder.value.order[i + 1]
    if (nextField) nextTick(() => refs[nextField]?.focus())
  }
  tryEmit()
}

function onFieldBackspace(field: DateField, i: number, e: KeyboardEvent) {
  if (values[field] !== '') return
  const prevField = fieldOrder.value.order[i - 1]
  if (!prevField) return
  e.preventDefault()
  refs[prevField]?.focus()
}

type ParseResult =
  | { state: 'empty' }
  | { state: 'incomplete' }
  | { state: 'invalid'; reason: 'range' | 'overflow' | 'future' }
  | { state: 'valid'; value: string }

// All three fields are re-validated together on every keystroke — this is the single
// source of truth for both what gets emitted and what error, if any, is shown.
const parsed = computed<ParseResult>(() => {
  if (values.day === '' && values.month === '' && values.year === '') return { state: 'empty' }
  if (values.day.length !== 2 || values.month.length !== 2 || values.year.length !== 4) return { state: 'incomplete' }

  const d = Number(values.day), m = Number(values.month), y = Number(values.year)
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900) return { state: 'invalid', reason: 'range' }

  const candidate = `${values.year}-${values.month}-${values.day}`
  const dt = new Date(`${candidate}T00:00:00.000Z`)
  // Reject overflowed dates (e.g. 31.02) — the UTC components must round-trip.
  if (dt.getUTCDate() !== d || dt.getUTCMonth() + 1 !== m || dt.getUTCFullYear() !== y) return { state: 'invalid', reason: 'overflow' }
  if (props.max && candidate > props.max) return { state: 'invalid', reason: 'future' }

  return { state: 'valid', value: candidate }
})

const isInvalid = computed(() => parsed.value.state === 'invalid')

// Re-emit whenever the invalid/valid boundary is crossed so the parent can gate its
// own Save button — silently falling back to the last confirmed date on submit is
// what caused a "1000" typo to get saved as the old, unrelated 2009 birth date.
watch(isInvalid, (v) => emit('invalid', v))

const shaking = ref(false)
let shakeTimer: ReturnType<typeof setTimeout> | null = null
function shake() {
  shaking.value = false
  requestAnimationFrame(() => {
    shaking.value = true
    if (shakeTimer) clearTimeout(shakeTimer)
    shakeTimer = setTimeout(() => { shaking.value = false }, 400)
  })
}
watch(isInvalid, (v) => { if (v) shake() })

defineExpose({ isInvalid, shake })

const invalidReason = computed(() => {
  if (parsed.value.state !== 'invalid') return ''
  const ru = langStore.currentLang === 'RU'
  switch (parsed.value.reason) {
    case 'range':    return ru ? 'Проверьте день, месяц и год — дата вне допустимого диапазона' : 'Check the day, month and year — date is out of range'
    case 'overflow': return ru ? 'Такой даты не существует' : 'That date does not exist'
    case 'future':   return ru ? 'Дата не может быть в будущем' : 'Date cannot be in the future'
  }
})

// Only 'empty' and 'valid' ever reach the parent — 'incomplete' (still typing) and
// 'invalid' (bad range/overflow/future) are surfaced via isInvalid instead, so a bad
// edit is never silently dropped in favour of the last good value.
function tryEmit() {
  const p = parsed.value
  if (p.state === 'empty') emit('update:modelValue', null)
  else if (p.state === 'valid') emit('update:modelValue', p.value)
}
</script>

<style scoped>
.date-part {
  @apply bg-brand-bg border border-brand-border rounded-xl py-2.5 text-sm font-semibold text-white placeholder-brand-muted/50 focus:outline-none focus:border-brand-accent/50 transition-all;
}

@keyframes date-shake {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
.date-shake {
  animation: date-shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
}
</style>
