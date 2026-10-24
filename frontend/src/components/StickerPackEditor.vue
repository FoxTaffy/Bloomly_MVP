<script setup lang="ts">
/**
 * StickerPackEditor — создание и редактирование стикерпака.
 *  1. Стикеры: файлы / папка / импорт из Telegram, затем перетаскиванием меняем порядок
 *  2. Публикация: тип (свой, публичный, по приглашению, платный), название, описание, цена
 *  3. Обложка
 * Платный тип доступен только с подпиской Business.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useStickersStore, type StickerPack, type PackVisibility } from '@/stores/stickers'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorMessage, errorMessage } from '@/lib/apiError'
import BIcon from '@/components/BIcon.vue'
import { sanitizeTagInput } from '@/lib/tagRules'
import MediaUpload from '@/components/MediaUpload.vue'
import StickerUpload from '@/components/StickerUpload.vue'
import StickerReorderGrid from '@/components/StickerReorderGrid.vue'
import TelegramImportModal from '@/components/TelegramImportModal.vue'
import { emojiList } from '@/lib/emoji'

const props = defineProps<{ pack?: StickerPack | null }>()
const emit  = defineEmits<{
  (e: 'close'): void
  (e: 'saved', pack: StickerPack): void
}>()

const router = useRouter()
const auth   = useAuthStore()
const store  = useStickersStore()
const { confirmDialog } = useConfirm()

const MAX_STICKERS = 120
const CURRENCIES   = ['RUB', 'USD', 'EUR', 'GBP']
const COVER_COLORS = [
  '#1a1a2e', '#16213e', '#0f3460', '#533483', '#7B2D8B', '#C84B31', '#E26A2C', '#F5A623',
  '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#E91E63', '#FF5722', '#607D8B', '#2C3E50',
]

const isBusiness = computed(() => auth.user?.subscription_tier === 'business')

const VISIBILITY_OPTIONS: { key: PackVisibility; icon: string; title: string; hint: string }[] = [
  { key: 'own',    icon: 'Lock',  title: 'Свой',           hint: 'Только для вас. В каталоге не показывается' },
  { key: 'public', icon: 'Globe', title: 'Публичный',      hint: 'Виден в каталоге, добавить может любой' },
  { key: 'invite', icon: 'Link2', title: 'По приглашению', hint: 'Доступен только по вашей ссылке' },
  { key: 'paid',   icon: 'Crown', title: 'Платный',        hint: 'Продаётся за вашу цену · подписка Business' },
]

// ── Состояние ───────────────────────────────────────────────────────────────
type Step = 'stickers' | 'info' | 'cover' | 'done'
type Item = { key: string; url: string; nsfw: boolean; emojis: string }

let keySeq = 0
const newItem = (url: string, nsfw = false, emojis = ''): Item => ({ key: `s${++keySeq}`, url, nsfw, emojis })

const editingId = props.pack?.id ?? null
const step      = ref<Step>('stickers')
const saving    = ref(false)
const saveError = ref('')
const showTelegram = ref(false)
const savedPack = ref<StickerPack | null>(null)
const copied    = ref(false)

const items = ref<Item[]>(
  (props.pack?.stickers ?? []).map((url, i) => newItem(url, props.pack?.nsfw_stickers?.includes(i) ?? false, props.pack?.sticker_emojis?.[i] ?? '')),
)
const coverKey = ref<string | null>(
  props.pack?.cover_sticker_idx != null ? items.value[props.pack.cover_sticker_idx]?.key ?? null : null,
)
const selectedKey = ref<string | null>(null)

const form = ref({
  name:         props.pack?.name ?? '',
  description:  props.pack?.description ?? '',
  visibility:   (props.pack?.visibility ?? 'public') as PackVisibility,
  price:        props.pack ? parseFloat(props.pack.price) : 0,
  currency:     props.pack?.currency ?? 'RUB',
  isNsfw:       props.pack?.is_nsfw ?? false,
  hideAuthor:   props.pack?.hide_author ?? false,
  draft:        props.pack?.status === 'draft',
  coverUrl:     props.pack?.cover_url ?? '',
  coverBgColor: props.pack?.cover_bg_color ?? '#1a1a2e',
})

// ── Теги: каждый тег, отделённый пробелом, становится таблеткой ─────────────
const MAX_TAGS   = 10
const tagInput   = ref<HTMLInputElement | null>(null)
const tagList    = ref<string[]>(props.pack?.tags ? [...props.pack.tags] : [])
const tagDraft   = ref('')

function addTags(raw: string) {
  for (const part of raw.split(/[\s,]+/)) {
    const t = sanitizeTagInput(part).slice(0, 32)
    if (t && !tagList.value.includes(t) && tagList.value.length < MAX_TAGS) tagList.value.push(t)
  }
}

function commitTag() {
  if (tagDraft.value.trim()) addTags(tagDraft.value)
  tagDraft.value = ''
}

function onTagKey(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === ',' || e.key === 'Enter') {
    e.preventDefault()
    commitTag()
  } else if (e.key === 'Backspace' && !tagDraft.value && tagList.value.length) {
    tagList.value.pop()
  }
}

function removeTag(t: string) {
  tagList.value = tagList.value.filter(x => x !== t)
}

const remaining   = computed(() => MAX_STICKERS - items.value.length)
const nsfwCount   = computed(() => items.value.filter(i => i.nsfw).length)
const coverItem   = computed(() => items.value.find(i => i.key === coverKey.value) ?? null)
const isPaid      = computed(() => form.value.visibility === 'paid')
const infoValid   = computed(() => form.value.name.trim().length > 0 && (!isPaid.value || form.value.price > 0))
const STEPS: { k: Step; l: string }[] = [{ k: 'stickers', l: 'Стикеры' }, { k: 'info', l: 'Публикация' }, { k: 'cover', l: 'Обложка' }]
const stepIndex = computed(() => STEPS.findIndex(s => s.k === step.value))

const inviteLink = computed(() => {
  const code = savedPack.value?.invite_code ?? props.pack?.invite_code
  return code ? `${location.origin}/stickers/invite/${code}` : ''
})

// ── Стикеры ─────────────────────────────────────────────────────────────────
function addUrls(urls: string[], emojis: string[] = []) {
  const room = MAX_STICKERS - items.value.length
  const fresh = urls.slice(0, Math.max(0, room)).map((u, i) => newItem(u, false, emojis[i] ?? ''))
  items.value = [...items.value, ...fresh]
  if (!coverKey.value && fresh.length) coverKey.value = fresh[0].key
}

function removeItem(key: string) {
  items.value = items.value.filter(i => i.key !== key)
  if (coverKey.value === key) coverKey.value = null
  if (selectedKey.value === key) selectedKey.value = null
}

function toggleNsfw(item: Item) { item.nsfw = !item.nsfw }

function selectTile(key: string) { selectedKey.value = selectedKey.value === key ? null : key }
const selectedItem = computed(() => items.value.find(i => i.key === selectedKey.value) ?? null)
const selectedIndex = computed(() => items.value.findIndex(i => i.key === selectedKey.value))

// Эмодзи стикера: по ним в чате и комментариях подсказываются стикеры, когда в поле введён только этот эмодзи.
// Сервер повторно чистит значение; здесь — чтобы поле сразу показывало, что сохранится.
const onlyEmojis = (raw: string) => emojiList(raw).join('')

function onTelegramImported(p: { title: string; tg_name: string; sticker_urls: string[]; sticker_emojis?: string[] }) {
  addUrls(p.sticker_urls, p.sticker_emojis ?? [])
  if (!form.value.name.trim()) form.value.name = p.title
  if (!form.value.description.trim()) form.value.description = `Импортировано из Telegram (@${p.tg_name})`
  if (!tagList.value.length) addTags(p.tg_name)
}

// ── Публикация ──────────────────────────────────────────────────────────────
function pickVisibility(v: PackVisibility) {
  if (v === 'paid' && !isBusiness.value) return
  form.value.visibility = v
}

async function submit() {
  if (!infoValid.value) { step.value = 'info'; return }
  saving.value = true
  saveError.value = ''
  try {
    commitTag()
    const idxOf = (k: string | null) => k ? items.value.findIndex(i => i.key === k) : -1
    const payload = {
      name:            form.value.name.trim(),
      description:     form.value.description.trim() || undefined,
      visibility:      form.value.visibility,
      price:           isPaid.value ? form.value.price : 0,
      currency:        form.value.currency,
      isNsfw:          form.value.isNsfw,
      hideAuthor:      form.value.hideAuthor,
      tags:            [...tagList.value],
      status:          (form.value.draft ? 'draft' : 'published') as 'draft' | 'published',
      coverUrl:        form.value.coverUrl || undefined,
      coverBgColor:    form.value.coverBgColor || undefined,
      coverStickerIdx: idxOf(coverKey.value) >= 0 ? idxOf(coverKey.value) : null,
      stickers:        items.value.map(i => i.url),
      nsfwStickers:    items.value.flatMap((i, n) => i.nsfw ? [n] : []),
      stickerEmojis:   items.value.map(i => onlyEmojis(i.emojis)),
    }
    const result = editingId ? await store.updatePack(editingId, payload) : await store.createPack(payload)
    savedPack.value = result
    emit('saved', result)
    if (result.visibility === 'invite' && result.invite_code) step.value = 'done'
    else emit('close')
  } catch (err) {
    saveError.value = apiErrorMessage(err) ?? errorMessage(err) ?? 'Не удалось сохранить пак'
  } finally {
    saving.value = false
  }
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch { /* буфер недоступен — ссылку можно выделить вручную */ }
}

async function regenerateInvite() {
  if (!editingId) return
  if (!(await confirmDialog('Старая ссылка перестанет работать. Создать новую?'))) return
  try {
    savedPack.value = await store.updatePack(editingId, { regenerateInvite: true })
  } catch (err) {
    saveError.value = apiErrorMessage(err) ?? 'Не удалось обновить ссылку'
  }
}

async function tryClose() {
  const dirty = !editingId && (items.value.length > 0 || form.value.name.trim() !== '' || form.value.description.trim() !== '')
  if (step.value !== 'done' && dirty && !(await confirmDialog('Форма не сохранена. Закрыть без сохранения?'))) return
  emit('close')
}

function goSubscription() { emit('close'); router.push('/subscriptions') }
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-999 flex items-center justify-center p-4" @click.self="tryClose()">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-xs" />
      <div class="relative bg-brand-card border border-brand-border rounded-3xl p-6 max-w-lg w-full shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
        <button type="button" @click="tryClose()"
          class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors z-20">
          <BIcon name="X" class="w-4 h-4 text-white/50" />
        </button>

        <h2 class="text-xl font-extrabold text-white mb-1">{{ editingId ? 'Редактировать пак' : 'Новый стикерпак' }}</h2>
        <p class="text-white/40 text-xs mb-4">
          {{ step === 'done' ? 'Готово' : `Шаг ${stepIndex + 1} из ${STEPS.length}` }}
        </p>

        <div v-if="step !== 'done'" class="flex items-center gap-1 mb-6">
          <template v-for="(s, idx) in STEPS" :key="s.k">
            <button type="button" @click="step = s.k"
              class="flex items-center gap-1.5 select-none transition-all duration-200"
              :class="stepIndex >= idx ? 'text-white' : 'text-white/25'">
              <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-300"
                :class="step === s.k
                  ? 'bg-brand-accent text-white shadow-accent'
                  : stepIndex > idx
                    ? 'bg-brand-success/20 text-brand-success'
                    : 'bg-brand-bg border border-brand-border text-white/30'">
                <BIcon v-if="stepIndex > idx" name="Check" class="w-3.5 h-3.5" />
                <span v-else>{{ idx + 1 }}</span>
              </span>
              <span class="text-xs font-semibold hidden sm:inline">{{ s.l }}</span>
            </button>
            <div v-if="idx < STEPS.length - 1" class="flex-1 h-0.5 rounded-full mx-1 transition-colors duration-300"
              :class="stepIndex > idx ? 'bg-brand-success/40' : 'bg-brand-border'" />
          </template>
        </div>

        <!-- ── Шаг 1: стикеры ─────────────────────────────────────────────── -->
        <div v-if="step === 'stickers'" class="stack-y-4">
          <StickerUpload :remaining="remaining" @uploaded="addUrls([$event])" @telegram="showTelegram = true" />

          <div v-if="items.length" class="stack-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold text-white/55">
                {{ items.length }} / {{ MAX_STICKERS }} · перетащите, чтобы изменить порядок
              </span>
              <span v-if="nsfwCount" class="text-xs font-bold text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-full border border-rose-500/20">{{ nsfwCount }} NSFW</span>
            </div>

            <StickerReorderGrid v-model:items="items" class="grid grid-cols-4 sm:grid-cols-6 gap-2">
              <template #tile="{ item, index }">
                <div class="relative aspect-square rounded-2xl overflow-hidden bg-white/5 border-2 transition-colors cursor-grab active:cursor-grabbing group/tile"
                  :class="[item.nsfw ? 'border-rose-500/60' : selectedKey === item.key ? 'border-white/40' : 'border-transparent hover:border-white/20',
                           coverKey === item.key ? 'ring-2 ring-brand-purple ring-offset-2 ring-offset-[#0e0e1c]' : '']"
                  @click="selectTile(item.key)">
                  <img :src="item.url" draggable="false" class="w-full h-full object-contain p-1.5 pointer-events-none" />
                  <span class="absolute bottom-0.5 right-1 text-[9px] font-bold text-white/40 tabular-nums">{{ index + 1 }}</span>
                  <span v-if="item.emojis" class="absolute top-0.5 right-1 text-[11px] leading-none pointer-events-none" :title="`Эмодзи: ${item.emojis}`">{{ [...item.emojis][0] }}</span>
                  <div v-if="item.nsfw" class="absolute top-1 right-1 text-[8px] font-extrabold text-white bg-rose-500/90 px-1 rounded-full">18+</div>
                  <div v-if="coverKey === item.key" class="absolute top-1 left-1 w-4 h-4 bg-brand-purple rounded-full flex items-center justify-center">
                    <BIcon name="Star" class="w-2.5 h-2.5 text-white" />
                  </div>
                  <!-- Действия: по наведению (ПК) или после нажатия (телефон) -->
                  <div data-no-drag class="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1 bg-linear-to-t/srgb from-black/80 to-transparent transition-opacity"
                    :class="selectedKey === item.key ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-100'">
                    <button type="button" @click.stop="toggleNsfw(item)" title="18+"
                      class="w-6 h-6 rounded-full text-[8px] font-extrabold text-white" :class="item.nsfw ? 'bg-rose-500' : 'bg-white/25 hover:bg-rose-500'">18+</button>
                    <button type="button" @click.stop="coverKey = coverKey === item.key ? null : item.key" title="На обложку"
                      class="w-6 h-6 rounded-full flex items-center justify-center" :class="coverKey === item.key ? 'bg-brand-purple' : 'bg-white/25 hover:bg-brand-purple'">
                      <BIcon name="Star" class="w-3 h-3 text-white" />
                    </button>
                    <button type="button" @click.stop="removeItem(item.key)" title="Удалить"
                      class="w-6 h-6 rounded-full bg-white/25 hover:bg-rose-500 flex items-center justify-center">
                      <BIcon name="Trash2" class="w-3 h-3 text-white" />
                    </button>
                  </div>
                </div>
              </template>
              <template #ghost="{ item }">
                <img :src="item.url" class="w-full h-full object-contain p-1.5" />
              </template>
            </StickerReorderGrid>

            <!-- Эмодзи выбранного стикера -->
            <div v-if="selectedItem" class="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/5 border border-white/10">
              <img :src="selectedItem.url" alt="" class="w-10 h-10 object-contain shrink-0" />
              <label class="flex-1 min-w-0">
                <span class="block text-[11px] font-bold text-white/55 mb-1">Эмодзи стикера №{{ selectedIndex + 1 }} — по ним стикер подскажется в чате</span>
                <input :value="selectedItem.emojis" @input="selectedItem.emojis = ($event.target as HTMLInputElement).value"
                  @blur="selectedItem.emojis = onlyEmojis(selectedItem.emojis)"
                  placeholder="например 😂👍" maxlength="40" aria-label="Эмодзи стикера"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/20 border border-white/10 text-base text-white outline-hidden focus:border-brand-purple" />
              </label>
            </div>

            <p class="text-[11px] text-white/30">
              <span class="text-brand-purple">★</span> — стикер на обложке · <span class="text-rose-400">18+</span> — будет размыт без NSFW-режима
            </p>
          </div>

          <div class="flex justify-end pt-1">
            <button type="button" @click="step = 'info'"
              class="flex items-center gap-2 px-5 py-2.5 bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-brand-purple/20">
              Далее: публикация <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ── Шаг 2: публикация ──────────────────────────────────────────── -->
        <div v-else-if="step === 'info'" class="stack-y-4">
          <div>
            <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">Тип публикации</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button v-for="o in VISIBILITY_OPTIONS" :key="o.key" type="button" @click="pickVisibility(o.key)"
                class="relative text-left p-3.5 rounded-2xl border transition-all flex gap-3"
                :class="[form.visibility === o.key ? 'bg-brand-purple/15 border-brand-purple/60' : 'bg-white/5 border-white/10 hover:border-white/25',
                         o.key === 'paid' && !isBusiness ? 'opacity-60' : '']">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  :class="form.visibility === o.key ? 'bg-brand-purple text-white' : 'bg-white/10 text-white/60'">
                  <BIcon :name="o.icon" class="w-4 h-4" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-white flex items-center gap-1.5">
                    {{ o.title }}
                    <span v-if="o.key === 'paid' && !isBusiness" class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300">BUSINESS</span>
                  </p>
                  <p class="text-[11px] text-white/45 leading-snug mt-0.5">{{ o.hint }}</p>
                </div>
              </button>
            </div>
            <button v-if="!isBusiness" type="button" @click="goSubscription"
              class="mt-2 text-[11px] font-bold text-amber-300 hover:underline">Платные паки открываются с подпиской Business →</button>
          </div>

          <div v-if="form.visibility === 'invite' && editingId && inviteLink" class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 pl-4">
            <span class="flex-1 min-w-0 text-xs text-white/70 font-mono truncate">{{ inviteLink }}</span>
            <button type="button" @click="copyInvite" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold">
              <BIcon :name="copied ? 'Check' : 'Copy'" class="w-3.5 h-3.5" /> {{ copied ? 'Скопировано' : 'Ссылка' }}
            </button>
          </div>

          <div>
            <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Название *</label>
            <input v-model="form.name" maxlength="120" placeholder="Напр. «Весенние котики»"
              class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 outline-hidden focus:border-brand-purple/60 text-sm font-semibold" />
          </div>

          <div>
            <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Описание</label>
            <textarea v-model="form.description" rows="3" maxlength="1000" placeholder="Расскажите о стикерах…"
              class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 outline-hidden focus:border-brand-purple/60 text-sm resize-none" />
          </div>

          <div v-if="isPaid" class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Цена *</label>
              <input v-model.number="form.price" type="number" min="1" step="1"
                class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-hidden focus:border-brand-purple/60 text-sm" />
            </div>
            <div>
              <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Валюта</label>
              <select v-model="form.currency"
                class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-hidden focus:border-brand-purple/60 text-sm appearance-none">
                <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Теги</label>
            <div class="flex flex-wrap items-center gap-1.5 min-h-[46px] bg-white/5 border border-white/10 rounded-2xl px-3 py-2 cursor-text focus-within:border-brand-purple/60"
              @click="tagInput?.focus()">
              <span v-for="t in tagList" :key="t"
                class="inline-flex items-center gap-1 text-xs font-bold pl-2.5 pr-1.5 py-1 rounded-full bg-brand-purple/20 text-brand-purple border border-brand-purple/30">
                #{{ t }}
                <button type="button" @click.stop="removeTag(t)" class="w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/15">
                  <BIcon name="X" class="w-2.5 h-2.5" />
                </button>
              </span>
              <input ref="tagInput" v-model="tagDraft" :disabled="tagList.length >= MAX_TAGS" @keydown="onTagKey" @blur="commitTag"
                :placeholder="tagList.length ? '' : 'фурри арт анимация'"
                class="flex-1 min-w-32 bg-transparent outline-hidden text-sm text-white placeholder-white/25" />
            </div>
            <p class="text-[11px] text-white/30 mt-1">Через пробел · до {{ MAX_TAGS }} тегов</p>
          </div>

          <div v-for="t in [
              { m: 'isNsfw',     title: '18+ контент',     hint: 'Весь пак будет размыт без NSFW-режима', on: 'bg-rose-500' },
              { m: 'hideAuthor', title: 'Скрыть автора',   hint: 'Имя автора видно только администраторам', on: 'bg-brand-accent' },
              { m: 'draft',      title: 'Черновик',        hint: 'Пак не будет опубликован, пока вы не выключите',  on: 'bg-brand-purple' },
            ]" :key="t.m" class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
            <div>
              <p class="text-sm font-bold text-white">{{ t.title }}</p>
              <p class="text-xs text-white/45 mt-0.5">{{ t.hint }}</p>
            </div>
            <button type="button" @click="(form as any)[t.m] = !(form as any)[t.m]"
              class="w-12 h-6 rounded-full transition-all relative shrink-0" :class="(form as any)[t.m] ? t.on : 'bg-white/15'">
              <div class="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-md" :class="(form as any)[t.m] ? 'left-6' : 'left-0.5'" />
            </button>
          </div>

          <div class="flex gap-3 pt-1">
            <button type="button" @click="step = 'stickers'" class="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-sm font-bold rounded-2xl">
              <BIcon name="ChevronLeft" class="w-4 h-4 inline mr-1" />Назад
            </button>
            <button type="button" :disabled="!infoValid" @click="step = 'cover'"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-purple disabled:opacity-40 text-white text-sm font-bold rounded-2xl shadow-lg shadow-brand-purple/20">
              Далее: обложка <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ── Шаг 3: обложка ─────────────────────────────────────────────── -->
        <div v-else-if="step === 'cover'" class="stack-y-5">
          <div>
            <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">Предпросмотр</label>
            <div class="relative w-full aspect-3/2 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <img v-if="form.coverUrl" :src="form.coverUrl" class="absolute inset-0 w-full h-full object-cover" />
              <div v-else class="absolute inset-0" :style="{ background: form.coverBgColor }" />
              <div class="absolute inset-0 bg-linear-to-br/srgb from-white/5 via-transparent to-black/30 pointer-events-none" />
              <img v-if="coverItem" :src="coverItem.url" class="absolute right-4 bottom-4 w-28 h-28 object-contain drop-shadow-2xl" :class="coverItem.nsfw ? 'blur-md' : ''" />
              <div class="absolute bottom-0 inset-x-0 bg-linear-to-t/srgb from-black/80 via-black/30 to-transparent p-4 pt-8">
                <p class="font-black text-white text-xl leading-tight">{{ form.name || 'Название пака' }}</p>
                <p v-if="isPaid" class="text-white/70 text-sm mt-0.5">{{ form.price }} {{ form.currency }}</p>
                <p v-else class="text-emerald-400 text-sm font-bold mt-0.5">Бесплатно</p>
              </div>
            </div>
          </div>

          <div v-if="!form.coverUrl">
            <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">Цвет фона</label>
            <div class="flex flex-wrap gap-2">
              <button v-for="c in COVER_COLORS" :key="c" type="button" @click="form.coverBgColor = c"
                class="w-9 h-9 rounded-xl transition-all border-2" :style="{ background: c }"
                :class="form.coverBgColor === c ? 'border-white scale-110' : 'border-transparent hover:border-white/40'" />
              <label class="w-9 h-9 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 cursor-pointer flex items-center justify-center overflow-hidden relative" title="Свой цвет">
                <BIcon name="Pipette" class="w-4 h-4 text-white/50" />
                <input type="color" v-model="form.coverBgColor" class="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
              </label>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">
              {{ form.coverUrl ? '✓ Своё изображение' : 'Своё изображение (необязательно)' }}
            </label>
            <div v-if="form.coverUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-2xl">
              <img :src="form.coverUrl" class="w-14 h-10 object-cover rounded-xl border border-white/10" />
              <p class="flex-1 text-xs text-white/70">Перекрывает цвет фона</p>
              <button type="button" @click="form.coverUrl = ''" class="w-7 h-7 rounded-full bg-white/10 hover:bg-rose-500/20 flex items-center justify-center">
                <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
              </button>
            </div>
            <MediaUpload v-else type="posts" @uploaded="(urls: string[]) => form.coverUrl = urls[0] ?? ''" />
          </div>

          <div v-if="items.length">
            <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">Стикер на обложке</label>
            <div class="flex gap-2 flex-wrap max-h-40 overflow-y-auto">
              <button type="button" @click="coverKey = null" title="Без стикера"
                class="w-12 h-12 rounded-xl border-2 flex items-center justify-center text-white/40"
                :class="coverKey === null ? 'border-white/50 bg-white/10' : 'border-white/10 hover:border-white/30'">
                <BIcon name="X" class="w-4 h-4" />
              </button>
              <button v-for="i in items" :key="i.key" type="button" @click="coverKey = coverKey === i.key ? null : i.key"
                class="w-12 h-12 rounded-xl border-2 overflow-hidden bg-white/5"
                :class="coverKey === i.key ? 'border-brand-purple ring-2 ring-brand-purple/30' : 'border-white/10 hover:border-white/30'">
                <img :src="i.url" class="w-full h-full object-contain p-0.5" />
              </button>
            </div>
          </div>

          <p v-if="saveError" class="text-sm font-bold text-brand-error bg-brand-error/10 border border-brand-error/30 rounded-2xl px-4 py-3">{{ saveError }}</p>

          <div class="flex gap-3 pt-1">
            <button type="button" @click="step = 'info'" class="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-sm font-bold rounded-2xl">
              <BIcon name="ChevronLeft" class="w-4 h-4 inline mr-1" />Назад
            </button>
            <button type="button" @click="submit" :disabled="saving || !infoValid"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-2xl bg-brand-accent hover:opacity-90 shadow-accent">
              <span v-if="saving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <BIcon v-else :name="editingId ? 'Save' : 'Rocket'" class="w-4 h-4" />
              {{ saving ? 'Сохранение…' : editingId ? 'Сохранить' : form.draft ? 'Сохранить черновик' : 'Опубликовать' }}
            </button>
          </div>
        </div>

        <!-- ── Готово: ссылка-приглашение ─────────────────────────────────── -->
        <div v-else class="stack-y-4 text-center">
          <div class="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
            <BIcon name="Check" class="w-7 h-7 text-emerald-400" />
          </div>
          <h3 class="text-lg font-black text-white">Пак сохранён</h3>
          <p class="text-sm text-white/55">Отправьте эту ссылку тем, кому хотите дать доступ:</p>
          <div class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 pl-4">
            <span class="flex-1 min-w-0 text-xs text-white/80 font-mono truncate text-left">{{ inviteLink }}</span>
            <button type="button" @click="copyInvite"
              class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-purple text-white text-xs font-bold">
              <BIcon :name="copied ? 'Check' : 'Copy'" class="w-3.5 h-3.5" /> {{ copied ? 'Скопировано' : 'Копировать' }}
            </button>
          </div>
          <button type="button" @click="regenerateInvite" class="text-xs font-bold text-white/40 hover:text-white inline-flex items-center gap-1">
            <BIcon name="RefreshCw" class="w-3 h-3" /> Создать новую ссылку
          </button>
          <div class="pt-2">
            <button type="button" @click="emit('close')" class="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white text-sm font-bold rounded-2xl">Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <TelegramImportModal v-if="showTelegram" @close="showTelegram = false" @imported="onTelegramImported" />
</template>
