<script setup lang="ts">
import { apiErrorMessage, errorMessage } from '@/lib/apiError'
/**
 * StickerUpload — загрузка стикеров по правилам Telegram:
 *   • PNG или WEBP с прозрачным фоном
 *   • одна сторона ровно 512 px, вторая — 512 px или меньше
 *   • файл до 512 КБ
 *
 * Источники: файлы с ПК, целая папка, drag-and-drop (в том числе папок), импорт из Telegram.
 * Проверяет на клиенте до загрузки; сервер проверяет те же правила ещё раз.
 * Эмитит `uploaded(url)` для каждого стикера строго в порядке выбора файлов.
 */
import { ref, computed } from 'vue'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'

const emit = defineEmits<{
  (e: 'uploaded', url: string): void
  (e: 'telegram'): void
}>()

const props = defineProps<{
  /** Сколько стикеров ещё можно добавить в пак */
  remaining: number
}>()

const MAX_BYTES   = 512 * 1024
const SIDE        = 512
const CONCURRENCY = 3

type Failure = { id: number; name: string; error: string }

const filesInput  = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const dragging    = ref(false)
const busy        = ref(false)
const progress    = ref({ done: 0, total: 0 })
const failures    = ref<Failure[]>([])
let failureId = 0

const percent = computed(() => progress.value.total ? Math.round(progress.value.done / progress.value.total * 100) : 0)

function fail(name: string, error: string) {
  failures.value.push({ id: ++failureId, name, error })
}

// ── Проверки ─────────────────────────────────────────────────────────────────

function isPng(b: Uint8Array)  { return b.length > 26 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 }
function isWebp(b: Uint8Array) { return b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 }
const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])

/** PNG: цветовой тип 4 (серый+альфа) или 6 (RGBA). Индексированный PNG может иметь tRNS — отдаём серверу. */
function pngAlphaState(b: Uint8Array): 'yes' | 'no' | 'maybe' {
  const colour = b[25]
  if (colour === 4 || colour === 6) return 'yes'
  if (colour === 3) return 'maybe'
  return 'no'
}

/** WEBP: lossy без VP8X альфы не имеет; в VP8X есть флаг альфы; VP8L проверит сервер. */
function webpAlphaState(b: Uint8Array): 'yes' | 'no' | 'maybe' {
  const chunk = tag(b, 12)
  if (chunk === 'VP8X') return (b[20] & 0x10) ? 'yes' : 'no'
  if (chunk === 'VP8 ') return 'no'
  return 'maybe'
}

function dimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')) }
    img.src = url
  })
}

/** Возвращает текст ошибки или null, если файл подходит */
async function validate(file: File): Promise<string | null> {
  if (file.size > MAX_BYTES) return `Больше 512 КБ (${Math.round(file.size / 1024)} КБ)`
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  let alpha: 'yes' | 'no' | 'maybe'
  if (isPng(head))       alpha = pngAlphaState(head)
  else if (isWebp(head)) alpha = webpAlphaState(head)
  else return 'Нужен PNG или WEBP'
  if (alpha === 'no') return 'Нет прозрачного фона'
  try {
    const { w, h } = await dimensions(file)
    if (Math.max(w, h) !== SIDE) return `Одна сторона должна быть 512 px (получено ${w}×${h})`
  } catch (e) {
    return errorMessage(e) ?? 'Не удалось прочитать изображение'
  }
  return null
}

async function uploadOne(file: File): Promise<string | null> {
  const problem = await validate(file)
  if (problem) { fail(file.name, problem); return null }
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=stickers', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    return res.data.data.url as string
  } catch (err) {
    fail(file.name, apiErrorMessage(err) ?? errorMessage(err) ?? 'Ошибка загрузки')
    return null
  }
}

// ── Основной поток ───────────────────────────────────────────────────────────

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

async function processFiles(list: File[]) {
  const files = list
    .filter(f => /\.(png|webp)$/i.test(f.name) || f.type === 'image/png' || f.type === 'image/webp')
    .sort((a, b) => collator.compare(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name))

  const skipped = list.length - files.length
  if (skipped > 0) fail(`${skipped} файл(ов)`, 'Не PNG/WEBP — пропущено')
  if (!files.length) return

  let accepted = files
  if (files.length > props.remaining) {
    accepted = files.slice(0, Math.max(0, props.remaining))
    fail(`${files.length - accepted.length} файл(ов)`, 'Лимит 120 стикеров в паке — не добавлено')
  }
  if (!accepted.length) return

  busy.value = true
  progress.value = { done: 0, total: accepted.length }
  try {
    for (let i = 0; i < accepted.length; i += CONCURRENCY) {
      const batch = accepted.slice(i, i + CONCURRENCY)
      const urls = await Promise.all(batch.map(async f => {
        const u = await uploadOne(f)
        progress.value.done++
        return u
      }))
      urls.forEach(u => { if (u) emit('uploaded', u) })
    }
  } finally {
    busy.value = false
  }
}

function onPick(input: HTMLInputElement | null) {
  if (!input?.files) return
  const files = Array.from(input.files)
  input.value = ''
  processFiles(files)
}

// ── Drag-and-drop (в том числе папки) ───────────────────────────────────────

function readAllEntries(reader: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const all: any[] = []
    const next = () => reader.readEntries((batch: any[]) => {
      if (!batch.length) return resolve(all)
      all.push(...batch)
      next()
    }, reject)
    next()
  })
}

async function collect(entry: any, out: File[]) {
  if (entry.isFile) {
    const file: File = await new Promise((res, rej) => entry.file(res, rej))
    // Относительный путь нужен для сортировки внутри папки
    Object.defineProperty(file, 'webkitRelativePath', { value: entry.fullPath.replace(/^\//, '') })
    out.push(file)
  } else if (entry.isDirectory) {
    for (const child of await readAllEntries(entry.createReader())) await collect(child, out)
  }
}

async function onDrop(e: DragEvent) {
  dragging.value = false
  const items = Array.from(e.dataTransfer?.items ?? [])
  const entries = items.map(i => (i as any).webkitGetAsEntry?.()).filter(Boolean)
  if (entries.length) {
    const out: File[] = []
    for (const en of entries) await collect(en, out)
    return processFiles(out)
  }
  processFiles(Array.from(e.dataTransfer?.files ?? []))
}
</script>

<template>
  <div class="stack-y-3">
    <!-- Drop zone -->
    <div
      class="relative border-2 border-dashed rounded-2xl p-5 text-center transition-all select-none"
      :class="dragging
        ? 'border-brand-purple bg-brand-purple/10'
        : 'border-brand-border bg-brand-bg'"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop">

      <BIcon name="Sticker" class="w-9 h-9 mx-auto mb-2" :class="dragging ? 'text-brand-purple' : 'text-white/30'" />
      <p class="text-sm font-bold text-white/70 mb-3">Перетащите файлы или папку сюда</p>

      <div class="flex flex-wrap gap-2 justify-center">
        <button type="button" :disabled="busy || remaining <= 0" @click="filesInput?.click()"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-purple/15 border border-brand-purple/30 text-brand-purple hover:bg-brand-purple/25 disabled:opacity-40 transition-all">
          <BIcon name="FileImage" class="w-3.5 h-3.5" /> Файлы с ПК
        </button>
        <button type="button" :disabled="busy || remaining <= 0" @click="folderInput?.click()"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-purple/15 border border-brand-purple/30 text-brand-purple hover:bg-brand-purple/25 disabled:opacity-40 transition-all">
          <BIcon name="FolderOpen" class="w-3.5 h-3.5" /> Папка
        </button>
        <button type="button" :disabled="busy" @click="emit('telegram')"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 disabled:opacity-40 transition-all">
          <BIcon name="Send" class="w-3.5 h-3.5" /> Импорт из Telegram
        </button>
      </div>

      <div class="flex flex-wrap gap-1.5 justify-center mt-3 text-[11px] font-bold text-white/45">
        <span class="px-2 py-0.5 rounded-full bg-white/5">PNG / WEBP</span>
        <span class="px-2 py-0.5 rounded-full bg-white/5">сторона 512 px</span>
        <span class="px-2 py-0.5 rounded-full bg-white/5">до 512 КБ</span>
        <span class="px-2 py-0.5 rounded-full bg-white/5">прозрачный фон</span>
      </div>
      <p class="text-[11px] text-white/30 mt-2">
        Как в Telegram: белая обводка и тень —
        <a href="https://telegram.org/img/StickerExample.psd" target="_blank" rel="noopener" class="underline hover:text-white/60">пример PSD</a>
      </p>

      <input ref="filesInput" type="file" accept="image/png,image/webp" multiple class="hidden" @change="onPick(filesInput)" />
      <input ref="folderInput" type="file" webkitdirectory multiple class="hidden" @change="onPick(folderInput)" />
    </div>

    <!-- Progress -->
    <div v-if="busy" class="stack-y-1.5">
      <div class="flex justify-between text-xs font-bold text-white/55">
        <span>Загрузка стикеров…</span>
        <span class="tabular-nums">{{ progress.done }} / {{ progress.total }}</span>
      </div>
      <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div class="h-full rounded-full transition-all duration-200" :style="{ width: percent + '%', background: 'linear-gradient(90deg,#CD83F5,#7C3AED)' }" />
      </div>
    </div>

    <!-- Failures -->
    <div v-if="failures.length" class="rounded-2xl border border-brand-error/30 bg-brand-error/5 p-3 stack-y-1.5">
      <div class="flex items-center justify-between">
        <p class="text-xs font-extrabold text-brand-error">Не загружено: {{ failures.length }}</p>
        <button type="button" class="text-[11px] font-bold text-white/40 hover:text-white" @click="failures = []">Скрыть</button>
      </div>
      <ul class="max-h-28 overflow-y-auto stack-y-1">
        <li v-for="f in failures" :key="f.id" class="text-[11px] leading-snug text-white/60">
          <span class="font-bold text-white/80 break-all">{{ f.name }}</span> — {{ f.error }}
        </li>
      </ul>
    </div>
  </div>
</template>
