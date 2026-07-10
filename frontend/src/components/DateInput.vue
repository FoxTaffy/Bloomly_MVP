<template>
  <div class="flex items-center gap-1.5">
    <input
      ref="dayRef"
      v-model="day"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="2"
      placeholder="ДД"
      class="date-part w-14 text-center"
      @input="onDayInput"
      @keydown.backspace="onDayBackspace"
    />
    <span class="text-white/25 font-bold select-none">.</span>
    <input
      ref="monthRef"
      v-model="month"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="2"
      placeholder="ММ"
      class="date-part w-14 text-center"
      @input="onMonthInput"
      @keydown.backspace="onMonthBackspace"
    />
    <span class="text-white/25 font-bold select-none">.</span>
    <input
      ref="yearRef"
      v-model="year"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="4"
      placeholder="ГГГГ"
      class="date-part w-20 text-center"
      @input="onYearInput"
      @keydown.backspace="onYearBackspace"
    />
    <BIcon name="Calendar" class="w-4 h-4 text-white/25 ml-1 flex-shrink-0" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import BIcon from '@/components/BIcon.vue'

const props = defineProps<{ modelValue: string | null; max?: string }>()
const emit = defineEmits<{ 'update:modelValue': [val: string | null] }>()

const day   = ref('')
const month = ref('')
const year  = ref('')

const dayRef   = ref<HTMLInputElement | null>(null)
const monthRef = ref<HTMLInputElement | null>(null)
const yearRef  = ref<HTMLInputElement | null>(null)

function syncFromModel(v: string | null) {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-')
    year.value = y; month.value = m; day.value = d
  } else {
    year.value = ''; month.value = ''; day.value = ''
  }
}

watch(() => props.modelValue, syncFromModel, { immediate: true })

function onlyDigits(v: string): string { return v.replace(/\D/g, '') }

function onDayInput() {
  day.value = onlyDigits(day.value).slice(0, 2)
  if (day.value.length === 2) nextTick(() => monthRef.value?.focus())
  tryEmit()
}
function onMonthInput() {
  month.value = onlyDigits(month.value).slice(0, 2)
  if (month.value.length === 2) nextTick(() => yearRef.value?.focus())
  tryEmit()
}
function onYearInput() {
  year.value = onlyDigits(year.value).slice(0, 4)
  tryEmit()
}

function onDayBackspace() { /* nothing to jump back from */ }
function onMonthBackspace(e: KeyboardEvent) {
  if (month.value === '') { e.preventDefault(); dayRef.value?.focus() }
}
function onYearBackspace(e: KeyboardEvent) {
  if (year.value === '') { e.preventDefault(); monthRef.value?.focus() }
}

function tryEmit() {
  if (day.value === '' && month.value === '' && year.value === '') {
    emit('update:modelValue', null)
    return
  }
  if (day.value.length !== 2 || month.value.length !== 2 || year.value.length !== 4) return

  const d = Number(day.value), m = Number(month.value), y = Number(year.value)
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900) return

  const candidate = `${year.value}-${month.value}-${day.value}`
  const parsed = new Date(`${candidate}T00:00:00.000Z`)
  // Reject overflowed dates (e.g. 31.02) — the UTC components must round-trip.
  if (parsed.getUTCDate() !== d || parsed.getUTCMonth() + 1 !== m || parsed.getUTCFullYear() !== y) return
  if (props.max && candidate > props.max) return

  emit('update:modelValue', candidate)
}
</script>

<style scoped>
.date-part {
  @apply bg-brand-bg border border-brand-border rounded-xl py-2.5 text-sm font-semibold text-white placeholder-brand-muted/50 focus:outline-none focus:border-brand-accent/50 transition-all;
}
</style>
