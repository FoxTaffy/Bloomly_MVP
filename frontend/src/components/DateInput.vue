<template>
  <div class="flex items-center gap-1.5">
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
        :class="field === 'year' ? 'w-20' : 'w-14'"
        @input="onFieldInput(field, i)"
        @keydown.backspace="onFieldBackspace(field, i, $event)"
      />
    </template>
    <BIcon name="Calendar" class="w-4 h-4 text-white/25 ml-1 flex-shrink-0" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useLangStore, DATE_FIELD_ORDER, type DateField } from '@/stores/lang'

const props = defineProps<{ modelValue: string | null; max?: string }>()
const emit = defineEmits<{ 'update:modelValue': [val: string | null] }>()

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

function tryEmit() {
  if (values.day === '' && values.month === '' && values.year === '') {
    emit('update:modelValue', null)
    return
  }
  if (values.day.length !== 2 || values.month.length !== 2 || values.year.length !== 4) return

  const d = Number(values.day), m = Number(values.month), y = Number(values.year)
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900) return

  const dd = values.day, mm = values.month, yyyy = values.year
  const candidate = `${yyyy}-${mm}-${dd}`
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
