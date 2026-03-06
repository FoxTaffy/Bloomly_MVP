<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import api from '@/api'
import BIcon from './BIcon.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created'): void
}>()

// ── Templates ─────────────────────────────────────────────────────────────────
interface Template {
  id: string
  name: string
  colors: [string, string, string]
  angle: number
}
const TEMPLATES: Template[] = [
  { id: 'aurora',   name: 'Аврора',   colors: ['#4C67CF', '#a855f7', '#ec4899'], angle: 135 },
  { id: 'ocean',    name: 'Океан',    colors: ['#0ea5e9', '#2dd4bf', '#34d399'], angle: 145 },
  { id: 'fire',     name: 'Огонь',    colors: ['#dc2626', '#ea580c', '#fbbf24'], angle: 135 },
  { id: 'night',    name: 'Ночь',     colors: ['#0f172a', '#312e81', '#4C67CF'], angle: 135 },
  { id: 'rose',     name: 'Роза',     colors: ['#9f1239', '#e11d48', '#fb7185'], angle: 150 },
  { id: 'forest',   name: 'Лес',      colors: ['#064e3b', '#059669', '#6ee7b7'], angle: 135 },
  { id: 'gold',     name: 'Золото',   colors: ['#78350f', '#d97706', '#fde047'], angle: 125 },
  { id: 'dusk',     name: 'Закат',    colors: ['#1e1b4b', '#7c3aed', '#f472b6'], angle: 160 },
  { id: 'mint',     name: 'Мята',     colors: ['#134e4a', '#0d9488', '#5eead4'], angle: 140 },
  { id: 'cherry',   name: 'Вишня',    colors: ['#500724', '#9f1239', '#fda4af'], angle: 145 },
]

// ── State ─────────────────────────────────────────────────────────────────────
const selectedTemplateId = ref<string>('aurora')
const uploadedImageUrl    = ref<string | null>(null)
const uploadedImageFile   = ref<File | null>(null)
const bgImageLoaded       = ref(false)
const bgImageEl           = ref<HTMLImageElement | null>(null)

// Text overlay
const textEnabled = ref(false)
const textContent = ref('')
const textColor   = ref<'white' | 'black' | 'yellow' | 'pink'>('white')
const textSize    = ref<'sm' | 'md' | 'lg' | 'xl'>('lg')
const textBold    = ref(true)
const textY       = ref(50)   // % from top, draggable
const textAlign   = ref<'left' | 'center' | 'right'>('center')

// Sticker
type Sticker = { id: string; emoji: string; x: number; y: number }
const stickers = ref<Sticker[]>([])
const STICKER_EMOJIS = ['🔥','⚡','💫','✨','❤️','🌸','🎉','🐾','🦊','🐺','🌟','💜','🌙','🎨','🤙','👀','💯','🎵']

// Publishing
const isPublishing  = ref(false)
const fileInputRef  = ref<HTMLInputElement | null>(null)

// ── Computed ───────────────────────────────────────────────────────────────────
const selectedTemplate = computed(() => TEMPLATES.find(t => t.id === selectedTemplateId.value)!)

const bgGradient = computed(() => {
  const t = selectedTemplate.value
  return `linear-gradient(${t.angle}deg, ${t.colors[0]} 0%, ${t.colors[1]} 50%, ${t.colors[2]} 100%)`
})

const textColorMap: Record<string, string> = {
  white: '#ffffff', black: '#111111', yellow: '#fde047', pink: '#f472b6',
}
const textSizeMap: Record<string, { px: number; cls: string }> = {
  sm:  { px: 28, cls: 'text-base' },
  md:  { px: 38, cls: 'text-xl' },
  lg:  { px: 52, cls: 'text-2xl' },
  xl:  { px: 72, cls: 'text-4xl' },
}

// ── Image upload ───────────────────────────────────────────────────────────────
function openFilePicker() {
  fileInputRef.value?.click()
}

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadedImageFile.value = file
  uploadedImageUrl.value = URL.createObjectURL(file)
  bgImageLoaded.value = false
  // load image element for canvas
  const img = new Image()
  img.onload = () => { bgImageEl.value = img; bgImageLoaded.value = true }
  img.src = uploadedImageUrl.value
}

function removeImage() {
  uploadedImageUrl.value = null
  uploadedImageFile.value = null
  bgImageEl.value = null
  bgImageLoaded.value = false
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// ── Stickers ────────────────────────────────────────────────────────────────
let stickerCounter = 0
function addSticker(emoji: string) {
  stickers.value.push({
    id: `s${++stickerCounter}`,
    emoji,
    x: 40 + Math.random() * 20,
    y: 30 + Math.random() * 40,
  })
}
function removeSticker(id: string) {
  stickers.value = stickers.value.filter(s => s.id !== id)
}

// ── Draggable text ─────────────────────────────────────────────────────────────
let textDragActive = false
let textDragStartY = 0
let textDragStartVal = 0

function onTextPointerDown(e: PointerEvent) {
  textDragActive = true
  textDragStartY = e.clientY
  textDragStartVal = textY.value
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onTextPointerMove(e: PointerEvent) {
  if (!textDragActive) return
  const canvas = document.getElementById('story-preview-canvas')
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const dy = ((e.clientY - textDragStartY) / rect.height) * 100
  textY.value = Math.max(5, Math.min(90, textDragStartVal + dy))
}
function onTextPointerUp() { textDragActive = false }

// ── Canvas rendering (9:16 = 1080×1920) ──────────────────────────────────────
async function drawToCanvas(): Promise<Blob> {
  const W = 1080, H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background
  if (uploadedImageEl.value) {
    // Cover fill
    const img = uploadedImageEl.value
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
    const sw = img.naturalWidth * scale, sh = img.naturalHeight * scale
    ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
    // subtle darken overlay
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, W, H)
  } else {
    // Gradient background
    const t = selectedTemplate.value
    const angle = (t.angle * Math.PI) / 180
    const cx = W / 2, cy = H / 2
    const len = Math.sqrt(W * W + H * H) / 2
    const grd = ctx.createLinearGradient(
      cx - Math.cos(angle) * len, cy - Math.sin(angle) * len,
      cx + Math.cos(angle) * len, cy + Math.sin(angle) * len,
    )
    grd.addColorStop(0,   t.colors[0])
    grd.addColorStop(0.5, t.colors[1])
    grd.addColorStop(1,   t.colors[2])
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, W, H)
  }

  // Text overlay
  if (textEnabled.value && textContent.value.trim()) {
    const fs = textSizeMap[textSize.value].px * 3.5   // scale to 1080px width
    ctx.font = `${textBold.value ? '900' : '400'} ${fs}px Inter, sans-serif`
    ctx.fillStyle = textColorMap[textColor.value]
    ctx.textAlign = textAlign.value as CanvasTextAlign
    ctx.textBaseline = 'middle'
    // text shadow
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = 20
    const lines = textContent.value.split('\n')
    const lineH = fs * 1.25
    const totalH = lines.length * lineH
    const yStart = (textY.value / 100) * H - totalH / 2 + lineH / 2
    const x = textAlign.value === 'left' ? 80 : textAlign.value === 'right' ? W - 80 : W / 2
    lines.forEach((line, i) => {
      ctx.fillText(line, x, yStart + i * lineH, W - 160)
    })
    ctx.shadowBlur = 0
  }

  // Stickers (emoji on canvas - approx positioning)
  for (const s of stickers.value) {
    ctx.font = '120px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.emoji, (s.x / 100) * W, (s.y / 100) * H)
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/jpeg', 0.92)
  })
}

// Hack: reference to the bgImage element for canvas rendering
const uploadedImageEl = ref<HTMLImageElement | null>(null)
watch(bgImageEl, v => { uploadedImageEl.value = v })

// ── Publish ────────────────────────────────────────────────────────────────────
async function publishStory() {
  isPublishing.value = true
  try {
    let imageUrl: string | null = null

    // If user just uploaded an image AND no text/stickers → send as-is to save time
    const hasOverlay = (textEnabled.value && textContent.value.trim()) || stickers.value.length > 0
    if (uploadedImageFile.value && !hasOverlay) {
      // Direct upload of original file
      const fd = new FormData()
      fd.append('file', uploadedImageFile.value)
      const up = await api.post('/media/upload?folder=posts', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      imageUrl = up.data.url ?? up.data.data?.url ?? null
    } else {
      // Render canvas → upload blob
      const blob = await drawToCanvas()
      const file = new File([blob], 'story.jpg', { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('file', file)
      const up = await api.post('/media/upload?folder=posts', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      imageUrl = up.data.url ?? up.data.data?.url ?? null
    }

    if (!imageUrl) throw new Error('Upload failed: no URL returned')
    await api.post('/stories', { image_url: imageUrl })
    emit('created')
    emit('close')
  } catch (err) {
    console.error('Failed to publish story', err)
  } finally {
    isPublishing.value = false
  }
}

// ── Panel tabs ─────────────────────────────────────────────────────────────────
const activePanel = ref<'template' | 'text' | 'sticker'>('template')
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[600] flex items-stretch bg-black" @click.self="emit('close')">

      <!-- ── Left sidebar ──────────────────────────────────────────────────── -->
      <div class="w-[220px] hidden md:flex flex-col bg-[#0d0d13] border-r border-white/8 shrink-0">
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-4 border-b border-white/8">
          <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-500/30 flex items-center justify-center shrink-0">
            <BIcon name="Sparkles" class="w-3.5 h-3.5 text-purple-400" />
          </div>
          <span class="font-bold text-sm text-white">Редактор истории</span>
        </div>

        <!-- Panel tabs -->
        <div class="flex items-center px-3 pt-3 gap-1">
          <button v-for="tab in [{id:'template',icon:'Palette',label:'Фон'},{id:'text',icon:'Type',label:'Текст'},{id:'sticker',icon:'Smile',label:'Стикеры'}]"
            :key="tab.id"
            @click="activePanel = tab.id as any"
            class="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-semibold transition-all"
            :class="activePanel === tab.id
              ? 'bg-brand-accent/20 text-brand-accent'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'"
          >
            <BIcon :name="tab.icon" class="w-4 h-4" />
            {{ tab.label }}
          </button>
        </div>

        <!-- Template panel -->
        <div v-if="activePanel === 'template'" class="flex-1 overflow-y-auto custom-scroll px-3 py-3 space-y-2">
          <!-- Upload photo button -->
          <button
            @click="openFilePicker"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-white/20 hover:border-brand-accent/50 text-white/60 hover:text-white transition-all text-xs font-semibold"
          >
            <BIcon name="ImagePlus" class="w-4 h-4 text-brand-accent" />
            {{ uploadedImageUrl ? 'Сменить фото' : 'Загрузить фото' }}
          </button>
          <div v-if="uploadedImageUrl" class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
            <img :src="uploadedImageUrl" class="w-8 h-8 rounded-lg object-cover shrink-0" />
            <span class="flex-1 text-xs text-white/60 truncate">Фото загружено</span>
            <button @click="removeImage" class="text-white/40 hover:text-red-400 transition-colors">
              <BIcon name="X" class="w-3.5 h-3.5" />
            </button>
          </div>

          <p class="text-[10px] text-white/30 font-semibold uppercase tracking-wider pt-1 px-1">Шаблоны</p>
          <!-- Template grid -->
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="tpl in TEMPLATES"
              :key="tpl.id"
              @click="selectedTemplateId = tpl.id"
              class="group relative rounded-xl overflow-hidden transition-all"
              :class="selectedTemplateId === tpl.id && !uploadedImageUrl
                ? 'ring-2 ring-brand-accent scale-[0.97]'
                : 'hover:scale-[0.97] ring-1 ring-white/10'"
            >
              <div
                class="h-20 w-full"
                :style="{ background: `linear-gradient(${tpl.angle}deg, ${tpl.colors[0]} 0%, ${tpl.colors[1]} 50%, ${tpl.colors[2]} 100%)` }"
              ></div>
              <div class="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/60">
                <p class="text-[10px] text-white font-semibold">{{ tpl.name }}</p>
              </div>
              <div v-if="selectedTemplateId === tpl.id && !uploadedImageUrl"
                class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-brand-accent flex items-center justify-center">
                <BIcon name="Check" class="w-2.5 h-2.5 text-white" />
              </div>
            </button>
          </div>
        </div>

        <!-- Text panel -->
        <div v-if="activePanel === 'text'" class="flex-1 overflow-y-auto custom-scroll px-3 py-3 space-y-3">
          <label class="flex items-center gap-2 cursor-pointer px-1">
            <div
              @click="textEnabled = !textEnabled"
              class="w-9 h-5 rounded-full transition-all relative"
              :class="textEnabled ? 'bg-brand-accent' : 'bg-white/15'"
            >
              <div class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                   :class="textEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'"></div>
            </div>
            <span class="text-xs font-semibold text-white/80">Показать текст</span>
          </label>

          <template v-if="textEnabled">
            <textarea
              v-model="textContent"
              rows="3"
              placeholder="Твой текст…"
              class="w-full bg-white/8 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none resize-none focus:border-brand-accent/50 transition-colors"
            />

            <!-- Color -->
            <div>
              <p class="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-2">Цвет текста</p>
              <div class="flex gap-2">
                <button v-for="[key, val] in Object.entries(textColorMap)" :key="key"
                  @click="textColor = key as any"
                  class="w-7 h-7 rounded-full border-2 transition-all"
                  :class="textColor === key ? 'border-brand-accent scale-110' : 'border-transparent hover:scale-110'"
                  :style="{ background: val }"
                />
              </div>
            </div>

            <!-- Size -->
            <div>
              <p class="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-2">Размер</p>
              <div class="flex gap-1">
                <button v-for="sz in ['sm','md','lg','xl']" :key="sz"
                  @click="textSize = sz as any"
                  class="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border"
                  :class="textSize === sz
                    ? 'bg-brand-accent/20 text-brand-accent border-brand-accent/40'
                    : 'text-white/50 border-white/10 hover:text-white hover:border-white/20'"
                >{{ sz.toUpperCase() }}</button>
              </div>
            </div>

            <!-- Bold + Align -->
            <div class="flex gap-2">
              <button @click="textBold = !textBold"
                class="flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all"
                :class="textBold
                  ? 'bg-brand-accent/20 text-brand-accent border-brand-accent/40'
                  : 'text-white/50 border-white/10 hover:text-white'"
              >Жирный</button>
              <button v-for="al in ['left','center','right']" :key="al"
                @click="textAlign = al as any"
                class="w-9 py-1.5 rounded-lg border transition-all flex items-center justify-center"
                :class="textAlign === al
                  ? 'bg-brand-accent/20 text-brand-accent border-brand-accent/40'
                  : 'text-white/50 border-white/10 hover:text-white'"
              >
                <BIcon :name="al === 'left' ? 'AlignLeft' : al === 'center' ? 'AlignCenter' : 'AlignRight'" class="w-3.5 h-3.5" />
              </button>
            </div>

            <p class="text-[10px] text-white/30">Перетащи текст на превью</p>
          </template>
        </div>

        <!-- Sticker panel -->
        <div v-if="activePanel === 'sticker'" class="flex-1 overflow-y-auto custom-scroll px-3 py-3">
          <p class="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-2">Стикеры</p>
          <div class="grid grid-cols-6 gap-1">
            <button
              v-for="emoji in STICKER_EMOJIS" :key="emoji"
              @click="addSticker(emoji)"
              class="aspect-square flex items-center justify-center text-xl rounded-xl bg-white/5 hover:bg-white/12 border border-white/8 hover:border-white/20 transition-all hover:scale-110"
            >{{ emoji }}</button>
          </div>
          <p v-if="stickers.length" class="text-[10px] text-white/30 mt-2">Нажми на стикер в превью чтобы удалить</p>
        </div>

        <!-- Publish button (desktop) -->
        <div class="p-3 border-t border-white/8">
          <button
            @click="publishStory"
            :disabled="isPublishing"
            class="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3 rounded-xl text-sm font-bold text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <BIcon v-if="isPublishing" name="Loader2" class="w-4 h-4 animate-spin" />
            <BIcon v-else name="Sparkles" class="w-4 h-4" />
            {{ isPublishing ? 'Публикуем…' : 'Опубликовать' }}
          </button>
        </div>
      </div>

      <!-- ── Center: 9:16 preview ─────────────────────────────────────────── -->
      <div class="flex-1 flex flex-col items-center justify-center bg-[#080810] gap-4 py-6 px-4 overflow-hidden">
        <!-- Mobile header -->
        <div class="flex md:hidden items-center justify-between w-full max-w-[300px]">
          <button @click="emit('close')" class="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white">
            <BIcon name="X" class="w-5 h-5" />
          </button>
          <span class="font-bold text-white">История</span>
          <button @click="publishStory" :disabled="isPublishing"
            class="px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-sm font-bold text-white disabled:opacity-40 transition-all">
            {{ isPublishing ? '…' : 'Готово' }}
          </button>
        </div>

        <!-- Story phone frame -->
        <div
          id="story-preview-canvas"
          class="relative rounded-[28px] overflow-hidden shadow-2xl shadow-black/80 ring-1 ring-white/10 select-none"
          style="aspect-ratio: 9/16; height: min(75vh, 540px);"
          @pointermove="onTextPointerMove"
          @pointerup="onTextPointerUp"
        >
          <!-- Background -->
          <div
            class="absolute inset-0 transition-all duration-500"
            :style="uploadedImageUrl ? {} : { background: bgGradient }"
          >
            <img
              v-if="uploadedImageUrl"
              :src="uploadedImageUrl"
              class="w-full h-full object-cover"
              @load="bgImageLoaded = true"
            />
            <!-- Subtle vignette -->
            <div class="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 pointer-events-none"></div>
          </div>

          <!-- Watermark / info strip at top -->
          <div class="absolute top-4 left-4 right-4 flex items-center gap-2 pointer-events-none">
            <div class="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30"></div>
            <div class="space-y-1">
              <div class="h-2 w-20 rounded-full bg-white/30"></div>
              <div class="h-1.5 w-12 rounded-full bg-white/20"></div>
            </div>
          </div>

          <!-- Text overlay (draggable) -->
          <div
            v-if="textEnabled && textContent.trim()"
            class="absolute left-0 right-0 px-4 cursor-grab active:cursor-grabbing z-10"
            :style="{ top: textY + '%', transform: 'translateY(-50%)' }"
            @pointerdown="onTextPointerDown"
          >
            <p
              class="whitespace-pre-wrap leading-snug drop-shadow-lg"
              :class="[
                textSizeMap[textSize].cls,
                textBold ? 'font-black' : 'font-medium',
                textAlign === 'left' ? 'text-left' : textAlign === 'center' ? 'text-center' : 'text-right'
              ]"
              :style="{ color: textColorMap[textColor], textShadow: '0 2px 12px rgba(0,0,0,0.8)' }"
            >{{ textContent }}</p>
          </div>

          <!-- Stickers -->
          <div
            v-for="s in stickers"
            :key="s.id"
            class="absolute text-4xl cursor-pointer hover:scale-110 transition-transform z-10 select-none"
            :style="{ left: s.x + '%', top: s.y + '%', transform: 'translate(-50%, -50%)' }"
            @click.stop="removeSticker(s.id)"
          >{{ s.emoji }}</div>

          <!-- Upload hint when canvas is empty -->
          <div
            v-if="!uploadedImageUrl"
            class="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none opacity-30"
          >
            <BIcon name="Sparkles" class="w-10 h-10 text-white" />
            <p class="text-xs text-white font-semibold">История</p>
          </div>
        </div>

        <!-- Mobile bottom toolbar -->
        <div class="flex md:hidden items-center gap-3">
          <button @click="openFilePicker"
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold">
            <BIcon name="ImagePlus" class="w-4 h-4" />Фото
          </button>
          <button @click="activePanel = 'text'; textEnabled = true"
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold">
            <BIcon name="Type" class="w-4 h-4" />Текст
          </button>
          <button @click="activePanel = 'sticker'"
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold">
            <BIcon name="Smile" class="w-4 h-4" />Стикеры
          </button>
          <!-- Template switcher arrows -->
          <button
            @click="selectedTemplateId = TEMPLATES[(TEMPLATES.findIndex(t=>t.id===selectedTemplateId)+TEMPLATES.length-1)%TEMPLATES.length].id"
            class="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white">
            <BIcon name="ChevronLeft" class="w-4 h-4" />
          </button>
          <button
            @click="selectedTemplateId = TEMPLATES[(TEMPLATES.findIndex(t=>t.id===selectedTemplateId)+1)%TEMPLATES.length].id"
            class="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white">
            <BIcon name="ChevronRight" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- ── Right sidebar: close + tips ──────────────────────────────────── -->
      <div class="hidden md:flex flex-col w-14 items-center pt-4 pb-4 gap-4 bg-[#0d0d13] border-l border-white/8">
        <button
          @click="emit('close')"
          class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all"
        >
          <BIcon name="X" class="w-5 h-5" />
        </button>
      </div>

      <!-- Hidden file input -->
      <input ref="fileInputRef" type="file" accept="image/*,video/*" class="hidden" @change="onFileSelected" />

      <!-- Mobile text/sticker drawer -->
      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-y-full opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-full opacity-0"
      >
        <div
          v-if="activePanel !== 'template' && false /* desktop only panels, mobile inline */"
          class="md:hidden fixed bottom-0 left-0 right-0 bg-[#0d0d13] border-t border-white/10 rounded-t-2xl p-4 z-10"
        ></div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar { width: 4px }
.custom-scroll::-webkit-scrollbar-track { background: transparent }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px }
</style>
