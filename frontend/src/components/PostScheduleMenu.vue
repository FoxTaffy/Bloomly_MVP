<template>
  <div
    v-click-outside="() => emit('close')"
    class="absolute bottom-full right-0 mb-1.5 z-30 w-80 max-md:top-full max-md:bottom-auto max-md:mt-2 max-md:mb-0 max-md:-right-12 max-md:w-[calc(100vw-2rem)] max-md:max-w-80 bg-brand-card border border-brand-border rounded-2xl shadow-2xl p-4 stack-y-3"
  >
    <div class="flex items-center justify-between">
      <span class="text-sm font-bold text-white">Время отправки</span>
      <button @click="emit('close')" class="text-white/40 hover:text-white transition-colors">
        <BIcon name="X" class="w-4 h-4" />
      </button>
    </div>

    <!-- Date / time row ── Bloomly-styled, no native browser widgets -->
    <div class="flex items-center justify-between gap-2 px-1">
      <button
        type="button"
        @click.stop="showCalendar = !showCalendar"
        class="text-lg font-bold transition-colors"
        :class="date ? 'text-white hover:text-brand-accent' : 'text-white/35 hover:text-white/60'"
      >
        {{ dateLabel }}
      </button>

      <span class="text-xs text-white/35 font-semibold">в</span>

      <div class="flex items-center gap-1">
        <input
          ref="hourInputRef"
          v-model="hh"
          type="text"
          inputmode="numeric"
          maxlength="2"
          placeholder="--"
          class="time-part"
          @input="onHourInput"
          @blur="onHourBlur"
        />
        <span class="text-lg font-bold text-white/35">:</span>
        <input
          ref="minuteInputRef"
          v-model="mm"
          type="text"
          inputmode="numeric"
          maxlength="2"
          placeholder="--"
          class="time-part"
          @input="onMinuteInput"
          @blur="onMinuteBlur"
        />
      </div>
    </div>

    <!-- Calendar panel -->
    <div v-if="showCalendar" class="bg-brand-bg border border-brand-border rounded-2xl p-3 stack-y-2">
      <div class="flex items-center justify-between">
        <button type="button" @click="shiftMonth(-1)" class="p-1 rounded-lg text-white/50 hover:text-white hover:bg-brand-card transition-colors">
          <BIcon name="ChevronLeft" class="w-4 h-4" />
        </button>
        <span class="text-xs font-bold text-white">{{ monthLabel }}</span>
        <button type="button" @click="shiftMonth(1)" class="p-1 rounded-lg text-white/50 hover:text-white hover:bg-brand-card transition-colors">
          <BIcon name="ChevronRight" class="w-4 h-4" />
        </button>
      </div>

      <div class="grid grid-cols-7 gap-1">
        <span v-for="(w, i) in WEEKDAYS" :key="w" class="text-[10px] font-bold uppercase text-center"
          :class="i >= 5 ? 'text-brand-error/50' : 'text-white/35'">
          {{ w }}
        </span>
        <button
          v-for="cell in calendarCells"
          :key="`${cell.year}-${cell.month}-${cell.day}-${cell.inCurrent}`"
          type="button"
          :disabled="!cell.inCurrent || cell.isPast"
          @click="pickDay(cell)"
          class="aspect-square rounded-lg text-xs flex items-center justify-center transition-colors"
          :class="[
            !cell.inCurrent ? 'text-white/10 cursor-default'
              : cell.isPast ? 'text-white/15 cursor-not-allowed'
              : cell.isSelected ? 'bg-brand-accent text-white font-bold'
              : cell.isWeekend ? 'text-brand-error/70 hover:bg-brand-card'
              : 'text-white/80 hover:bg-brand-card',
            cell.isToday && !cell.isSelected ? 'ring-1 ring-inset ring-brand-accent/50' : '',
          ]"
        >
          {{ cell.day }}
        </button>
      </div>

      <button v-if="date" type="button" @click="clearDate" class="text-[11px] font-semibold text-white/40 hover:text-white transition-colors">
        Очистить
      </button>
    </div>

    <p v-if="error" class="text-[11px] text-brand-error">{{ error }}</p>

    <div class="flex items-center gap-2 pt-1">
      <button
        @click="submitDraft"
        class="flex-1 px-3 py-2 rounded-xl text-xs font-bold border border-brand-border text-white/70 hover:bg-brand-bg hover:text-white transition-all"
      >
        Сохранить в черновики
      </button>
      <button
        @click="submitSchedule"
        class="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-brand-accent text-white hover:bg-brand-accent-plus transition-all"
      >
        Запланировать
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import BIcon from './BIcon.vue'
import { guessTimezone, zonedTimeToUtcIso } from '@/lib/timezone'

const emit = defineEmits<{
  close: []
  draft: []
  schedule: [payload: { scheduledAt: string; timezone: string }]
}>()

const timezone = guessTimezone()
const error = ref('')

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const MONTHS_NOMINATIVE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const today = new Date()
today.setHours(0, 0, 0, 0)

// ── Date (custom calendar, no native <input type="date">) ──────────────────
const date = ref('') // "YYYY-MM-DD"
const showCalendar = ref(false)
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth())

const dateLabel = computed(() => {
  if (!date.value) return 'Выберите дату'
  const [y, m, d] = date.value.split('-').map(Number)
  const suffix = y !== today.getFullYear() ? ` ${y}` : ''
  return `${d} ${MONTHS_GENITIVE[m - 1]}${suffix}`
})
const monthLabel = computed(() => `${MONTHS_NOMINATIVE[viewMonth.value]} ${viewYear.value} г.`)

function shiftMonth(delta: number) {
  const next = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = next.getFullYear()
  viewMonth.value = next.getMonth()
}

interface Cell { day: number; month: number; year: number; inCurrent: boolean; isPast: boolean; isWeekend: boolean; isToday: boolean; isSelected: boolean }

const calendarCells = computed<Cell[]>(() => {
  const y = viewYear.value
  const m = viewMonth.value
  const daysInMonth = (yy: number, mm: number) => new Date(yy, mm + 1, 0).getDate()
  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7 // 0 = Monday
  const total = daysInMonth(y, m)

  const cells: Cell[] = []
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInMonth(y, m - 1) - i, month: m - 1, year: y, inCurrent: false, isPast: false, isWeekend: false, isToday: false, isSelected: false })
  }
  for (let d = 1; d <= total; d++) {
    const cellDate = new Date(y, m, d)
    const weekday = (cellDate.getDay() + 6) % 7
    cells.push({
      day: d, month: m, year: y, inCurrent: true,
      isPast: cellDate.getTime() < today.getTime(),
      isWeekend: weekday >= 5,
      isToday: cellDate.getTime() === today.getTime(),
      isSelected: date.value === `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    })
  }
  let filler = 1
  while (cells.length % 7 !== 0) {
    cells.push({ day: filler++, month: m + 1, year: y, inCurrent: false, isPast: false, isWeekend: false, isToday: false, isSelected: false })
  }
  return cells
})

function pickDay(cell: Cell) {
  if (!cell.inCurrent || cell.isPast) return
  date.value = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
  showCalendar.value = false
}

function clearDate() {
  date.value = ''
}

// ── Time (two segmented digit fields, matching the app's DateInput style) ──
const hh = ref('')
const mm = ref('')
const hourInputRef = ref<HTMLInputElement | null>(null)
const minuteInputRef = ref<HTMLInputElement | null>(null)

function onlyDigits(v: string): string { return v.replace(/\D/g, '') }

function onHourInput() {
  hh.value = onlyDigits(hh.value).slice(0, 2)
  if (hh.value.length === 2) nextTick(() => minuteInputRef.value?.focus())
}
function onHourBlur() {
  if (hh.value === '') return
  hh.value = String(Math.min(23, parseInt(hh.value, 10) || 0)).padStart(2, '0')
}
function onMinuteInput() {
  mm.value = onlyDigits(mm.value).slice(0, 2)
}
function onMinuteBlur() {
  if (mm.value === '') return
  mm.value = String(Math.min(59, parseInt(mm.value, 10) || 0)).padStart(2, '0')
}

function submitDraft() {
  emit('draft')
}

function submitSchedule() {
  error.value = ''
  onHourBlur()
  onMinuteBlur()
  if (!date.value || !hh.value || !mm.value) {
    error.value = 'Укажите дату и время публикации'
    return
  }
  const scheduledAt = zonedTimeToUtcIso(`${date.value}T${hh.value}:${mm.value}`, timezone)
  if (new Date(scheduledAt).getTime() <= Date.now()) {
    error.value = 'Время публикации должно быть в будущем'
    return
  }
  emit('schedule', { scheduledAt, timezone })
}

// ── Click-outside directive ────────────────────────────────────────────────
const vClickOutside = {
  mounted(el: HTMLElement, binding: any) {
    (el as any)._clickOutside = (e: Event) => {
      if (!el.contains(e.target as Node)) binding.value(e)
    }
    document.addEventListener('click', (el as any)._clickOutside)
  },
  unmounted(el: HTMLElement) {
    document.removeEventListener('click', (el as any)._clickOutside)
  },
}
</script>

<style scoped>
@reference "../assets/style.css";
.time-part {
  @apply w-9 bg-transparent border-0 border-b-2 border-brand-border text-center text-lg font-bold text-white placeholder-white/25 outline-hidden focus:border-brand-accent transition-colors;
}
</style>
