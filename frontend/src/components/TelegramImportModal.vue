<script setup lang="ts">
/**
 * TelegramImportModal — import a Telegram sticker pack into Bloomly.
 * Emits `imported` with { title, tg_name, sticker_urls } when successful,
 * so the parent can pre-fill the create-pack form.
 */
import { ref } from 'vue'
import { useStickersStore } from '@/stores/stickers'
import BIcon from '@/components/BIcon.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', payload: { title: string; tg_name: string; sticker_urls: string[] }): void
}>()

const store = useStickersStore()

type Step = 'idle' | 'loading' | 'done' | 'error'

const step    = ref<Step>('idle')
const link    = ref('')
const maxStickers = ref(60)
const error   = ref('')
const result  = ref<{ title: string; tg_name: string; total: number; imported: number; sticker_urls: string[] } | null>(null)

// ── Link paste helper ─────────────────────────────────────────────────────
function extractName(raw: string): string {
  const m = raw.match(/addstickers\/([A-Za-z0-9_]+)/)
  return m ? m[1] : raw.trim()
}

// ── Import ────────────────────────────────────────────────────────────────
async function doImport() {
  const cleanLink = link.value.trim()
  if (!cleanLink) return

  step.value  = 'loading'
  error.value = ''
  result.value = null

  try {
    result.value = await store.importFromTelegram(cleanLink, maxStickers.value)
    step.value = 'done'
  } catch (err: any) {
    error.value =
      err?.response?.data?.error ??
      err?.message ??
      'Произошла ошибка. Проверьте ссылку и попробуйте снова.'
    step.value = 'error'
  }
}

function useResult() {
  if (!result.value) return
  emit('imported', {
    title:        result.value.title,
    tg_name:      result.value.tg_name,
    sticker_urls: result.value.sticker_urls,
  })
  emit('close')
}

function reset() {
  step.value   = 'idle'
  link.value   = ''
  error.value  = ''
  result.value = null
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="$emit('close')">

      <div class="w-full max-w-lg bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-2xl">

        <!-- Header -->
        <div class="flex items-center justify-between px-6 pt-6 pb-4 border-b border-brand-border">
          <div class="flex items-center gap-3">
            <!-- Telegram logo colour -->
            <div class="w-10 h-10 rounded-2xl bg-[#2AABEE]/15 border border-[#2AABEE]/30 flex items-center justify-center">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="#2AABEE">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </div>
            <div>
              <h2 class="text-base font-extrabold text-white">Импорт из Telegram</h2>
              <p class="text-[11px] text-white/45">Стикеры в формате WebP, 512×512</p>
            </div>
          </div>
          <button
            @click="$emit('close')"
            class="w-8 h-8 rounded-full bg-brand-bg hover:bg-brand-border flex items-center justify-center transition-all">
            <BIcon name="X" class="w-4 h-4 text-white/70" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-5">

          <!-- ── idle / error form ─────────────────────────────────────── -->
          <template v-if="step === 'idle' || step === 'error'">

            <div>
              <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">
                Ссылка или название пака
              </label>
              <div class="flex gap-2">
                <input
                  v-model="link"
                  type="text"
                  placeholder="https://t.me/addstickers/PackName"
                  class="flex-1 bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#2AABEE] transition-colors font-mono"
                  @keydown.enter.prevent="doImport" />
              </div>
              <p class="text-[11px] text-white/35 mt-1.5">
                Пример: <span class="text-[#2AABEE]/70">https://t.me/addstickers/Cats</span>
                &nbsp;или просто&nbsp;<span class="text-[#2AABEE]/70">Cats</span>
              </p>
            </div>

            <!-- Max stickers -->
            <div>
              <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">
                Максимум стикеров: <span class="text-white font-extrabold">{{ maxStickers }}</span>
              </label>
              <input
                v-model.number="maxStickers"
                type="range"
                min="1"
                max="120"
                class="w-full accent-[#2AABEE]" />
              <div class="flex justify-between text-[10px] text-white/30 mt-0.5">
                <span>1</span><span>60</span><span>120</span>
              </div>
            </div>

            <!-- Error banner -->
            <div
              v-if="step === 'error'"
              class="flex items-start gap-3 bg-brand-error/10 border border-brand-error/30 rounded-2xl px-4 py-3">
              <BIcon name="AlertTriangle" class="w-4 h-4 text-brand-error mt-0.5 shrink-0" />
              <p class="text-sm text-brand-error leading-snug">{{ error }}</p>
            </div>

            <!-- Info box -->
            <div class="bg-[#2AABEE]/5 border border-[#2AABEE]/20 rounded-2xl px-4 py-3 space-y-1">
              <p class="text-[11px] text-white/55 leading-relaxed">
                <span class="text-[#2AABEE] font-bold">Как работает:</span>
                Сервер скачивает стикеры из Telegram и загружает их в хранилище Bloomly. Импортируются только статичные стикеры типа WebP.
                Анимированные (.tgs) и видео-стикеры пропускаются.
              </p>
            </div>

            <!-- Action -->
            <button
              :disabled="!link.trim()"
              @click="doImport"
              class="w-full py-3 font-extrabold text-sm rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white"
              style="background: linear-gradient(135deg, #229ED9, #2AABEE);">
              <span class="flex items-center justify-center gap-2">
                <BIcon name="Download" class="w-4 h-4" />
                Импортировать
              </span>
            </button>
          </template>

          <!-- ── loading ──────────────────────────────────────────────── -->
          <template v-else-if="step === 'loading'">
            <div class="py-10 flex flex-col items-center gap-5">
              <div class="relative">
                <div class="w-16 h-16 rounded-full border-4 border-[#2AABEE]/20 border-t-[#2AABEE] animate-spin" />
                <svg class="absolute inset-0 m-auto w-7 h-7" viewBox="0 0 24 24" fill="#2AABEE">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </div>
              <div class="text-center">
                <p class="font-bold text-white text-sm">Загружаем стикеры из Telegram…</p>
                <p class="text-xs text-white/45 mt-1">Это может занять до минуты для больших паков</p>
              </div>
            </div>
          </template>

          <!-- ── done ─────────────────────────────────────────────────── -->
          <template v-else-if="step === 'done' && result">
            <div class="space-y-4">
              <!-- Summary -->
              <div class="bg-brand-success/10 border border-brand-success/30 rounded-2xl px-4 py-3 flex items-center gap-3">
                <BIcon name="CheckCircle2" class="w-5 h-5 text-brand-success shrink-0" />
                <div>
                  <p class="text-sm font-bold text-white">
                    {{ result.imported }} из {{ result.total }} стикеров загружено
                  </p>
                  <p class="text-[11px] text-white/50">
                    Пак «{{ result.title }}» · <span class="text-white/30">@{{ result.tg_name }}</span>
                  </p>
                </div>
              </div>

              <!-- Preview grid -->
              <div class="grid grid-cols-5 gap-1.5 max-h-56 overflow-y-auto pr-1">
                <div
                  v-for="(url, i) in result.sticker_urls"
                  :key="i"
                  class="aspect-square rounded-xl bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjMjIyIi8+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iIzJhMmEyYSIvPjxyZWN0IHg9IjgiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMyYTJhMmEiLz48L3N2Zz4=')] border border-brand-border overflow-hidden">
                  <img :src="url" :alt="`sticker ${i+1}`" class="w-full h-full object-contain p-0.5" loading="lazy" />
                </div>
              </div>

              <!-- Attention: WebP note -->
              <div class="flex items-start gap-2 text-[11px] text-white/40">
                <BIcon name="Info" class="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#2AABEE]/60" />
                Стикеры сохранены в формате WebP (оригинальный формат Telegram).
                При создании пака они будут отображаться корректно.
              </div>

              <div class="flex gap-3">
                <button
                  @click="reset"
                  class="flex-1 py-2.5 text-sm font-bold bg-brand-bg border border-brand-border hover:bg-brand-border text-white rounded-2xl transition-all">
                  Новый импорт
                </button>
                <button
                  @click="useResult"
                  class="flex-1 py-2.5 text-sm font-extrabold rounded-2xl text-white transition-all"
                  style="background: linear-gradient(135deg, #229ED9, #2AABEE);">
                  Создать пак →
                </button>
              </div>
            </div>
          </template>

        </div>
      </div>
    </div>
  </Teleport>
</template>
