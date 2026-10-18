<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        class="fixed inset-0 z-999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        @click.self="$emit('close')"
      >
        <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden"
          style="max-height: 90vh">

          <!-- Drag pill (mobile) -->
          <div class="flex justify-center pt-2 pb-1 sm:hidden shrink-0">
            <div class="w-10 h-1 rounded-full bg-brand-border" />
          </div>

          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-brand-border shrink-0">
            <div class="flex items-center gap-2">
              <BIcon name="Sticker" class="w-4 h-4 text-brand-accent" />
              <span class="text-sm font-semibold text-white">Стикерпак</span>
            </div>
            <button @click="$emit('close')" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>

          <!-- Loading -->
          <div v-if="state === 'loading'" class="flex flex-col items-center justify-center py-12 gap-3">
            <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
            <p class="text-sm text-white/55">Загрузка...</p>
          </div>

          <!-- Not found -->
          <div v-else-if="state === 'not-found'" class="flex flex-col items-center justify-center py-10 gap-3 px-6 text-center">
            <div class="w-14 h-14 rounded-2xl bg-brand-bg flex items-center justify-center">
              <BIcon name="PackageOpen" class="w-7 h-7 text-white/30" />
            </div>
            <p class="text-sm text-white font-semibold">Пак не найден</p>
            <p class="text-xs text-white/45">Стикер не принадлежит ни одному известному паку</p>
          </div>

          <!-- Private pack -->
          <div v-else-if="state === 'private'" class="flex flex-col items-center justify-center py-10 gap-3 px-6 text-center">
            <div class="w-14 h-14 rounded-2xl bg-brand-bg flex items-center justify-center">
              <BIcon name="Lock" class="w-7 h-7 text-white/30" />
            </div>
            <p class="text-sm text-white font-semibold">Закрытый пак</p>
            <p class="text-xs text-white/45">Этот стикерпак является приватным и недоступен для просмотра</p>
          </div>

          <!-- Pack found -->
          <template v-else-if="state === 'found' && pack">
            <div class="flex-1 overflow-y-auto min-h-0">

              <!-- Pack cover + info -->
              <div class="relative">
                <!-- Cover gradient header -->
                <div
                  class="w-full h-28 flex items-center justify-center overflow-hidden"
                  :style="pack.cover_url ? '' : `background: ${pack.cover_bg_color ?? '#1a1a2e'}`">
                  <img v-if="pack.cover_url" :src="pack.cover_url" class="w-full h-full object-cover" />

                  <div v-else class="w-full h-full flex items-center justify-center gap-2 flex-wrap p-2">
                    <div
                      v-for="(url, i) in pack.stickers.slice(0, 4)"
                      :key="i"
                      class="w-14 h-14 opacity-90">
                      <StickerImg :src="url" />
                    </div>
                  </div>
                </div>

                <!-- NSFW badge -->
                <span v-if="pack.is_nsfw" class="absolute top-2 right-2 text-[10px] font-extrabold bg-red-500/80 text-white px-2 py-0.5 rounded-full border border-red-400/60">
                  NSFW
                </span>
              </div>

              <!-- Title block -->
              <div class="px-5 pt-3 pb-2">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="text-base font-bold text-white truncate">{{ pack.name }}</h3>
                    <p class="text-xs text-white/50 mt-0.5">
                      by <span class="text-white/70 font-medium">{{ pack.author?.display_name || pack.author?.username }}</span>
                      · {{ pack.stickers.length }} стикеров
                      · ❤️ {{ pack._count.userCollections }}
                    </p>
                    <p v-if="pack.description" class="text-xs text-white/50 mt-1 line-clamp-2">{{ pack.description }}</p>
                  </div>

                  <!-- Price badge -->
                  <div class="shrink-0">
                    <span v-if="Number(pack.price) === 0"
                      class="text-xs font-bold px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Бесплатно
                    </span>
                    <span v-else
                      class="text-xs font-bold px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {{ Number(pack.price).toFixed(0) }} {{ pack.currency }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Clicked sticker highlight -->
              <div class="flex justify-center px-5 pb-3">
                <div class="w-24 h-24 rounded-2xl bg-brand-bg border-2 border-brand-accent/40 overflow-hidden shadow-lg p-1">
                  <StickerImg :src="stickerUrl" />
                </div>
              </div>

              <!-- Sticker grid preview -->
              <div v-if="pack.stickers.length > 1" class="px-4 pb-3">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-2">Все стикеры в паке</p>
                <div class="grid grid-cols-5 gap-1.5">
                  <div
                    v-for="(url, i) in pack.stickers.slice(0, 20)"
                    :key="i"
                    :class="[
                      'aspect-square rounded-xl overflow-hidden border transition-all p-1',
                      url === stickerUrl
                        ? 'border-brand-accent/60 bg-brand-accent/10'
                        : 'border-brand-border/40 bg-white/5'
                    ]">
                    <StickerImg :src="url" />
                  </div>
                  <div v-if="pack.stickers.length > 20"
                    class="aspect-square rounded-xl border border-brand-border/40 bg-white/5 flex items-center justify-center text-[10px] text-white/40 font-bold">
                    +{{ pack.stickers.length - 20 }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Action bar -->
            <div class="px-4 py-3 border-t border-brand-border shrink-0 stack-y-2">

              <!-- Already in collection -->
              <div v-if="pack.in_collection" class="flex gap-2">
                <div class="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-semibold">
                  <BIcon name="Check" class="w-4 h-4" />
                  В коллекции
                </div>
                <button
                  @click="removeFromCollection"
                  :disabled="actionLoading"
                  class="px-4 py-2 rounded-xl border border-brand-border text-white/50 hover:text-brand-error hover:border-brand-error/40 text-sm transition-colors disabled:opacity-40">
                  Убрать
                </button>
              </div>

              <!-- Free — add to collection -->
              <button
                v-else-if="Number(pack.price) === 0"
                @click="addToCollection"
                :disabled="actionLoading"
                class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold transition-all disabled:opacity-40">
                <BIcon v-if="actionLoading" name="Loader2" class="w-4 h-4 animate-spin" />
                <BIcon v-else name="Plus" class="w-4 h-4" />
                Добавить в коллекцию
              </button>

              <!-- Paid — buy only -->
              <button
                v-else
                @click="goToCatalog"
                class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 text-sm font-bold transition-all hover:bg-amber-500/30">
                <BIcon name="ShoppingCart" class="w-4 h-4" />
                Купить за {{ Number(pack.price).toFixed(0) }} {{ pack.currency }}
              </button>

              <!-- Share row -->
              <div class="flex gap-2">
                <button
                  @click="goToCatalog"
                  class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-brand-border text-white/60 hover:text-white hover:bg-brand-bg transition-colors text-xs font-semibold">
                  <BIcon name="ExternalLink" class="w-3.5 h-3.5" />
                  Открыть в каталоге
                </button>
                <button
                  @click="shareLink"
                  class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-brand-border text-white/60 hover:text-white hover:bg-brand-bg transition-colors text-xs font-semibold">
                  <BIcon name="Share2" class="w-3.5 h-3.5" />
                  {{ copied ? 'Скопировано!' : 'Поделиться' }}
                </button>
              </div>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import StickerImg from '@/components/StickerImg.vue'
import { useStickersStore, type StickerPack } from '@/stores/stickers'

const props = defineProps<{
  show: boolean
  stickerUrl: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const router  = useRouter()
const sStore  = useStickersStore()

type State = 'loading' | 'not-found' | 'private' | 'found'

const state         = ref<State>('loading')
const pack          = ref<StickerPack | null>(null)
const actionLoading = ref(false)
const copied        = ref(false)

// ── Load pack info when modal opens ──────────────────────────────────────────
watch(() => props.show, async (open) => {
  if (!open) return
  if (!props.stickerUrl) { state.value = 'not-found'; return }

  state.value = 'loading'
  pack.value  = null

  const result = await sStore.findPackByUrl(props.stickerUrl)
  if (!result) {
    state.value = 'not-found'
  } else if (result.private) {
    state.value = 'private'
  } else {
    pack.value  = result.pack
    state.value = 'found'
  }
}, { immediate: false })

// ── Actions ───────────────────────────────────────────────────────────────────
async function addToCollection() {
  if (!pack.value) return
  actionLoading.value = true
  try {
    await sStore.addToCollection(pack.value.id)
    pack.value = { ...pack.value, in_collection: true }
  } finally {
    actionLoading.value = false
  }
}

async function removeFromCollection() {
  if (!pack.value) return
  actionLoading.value = true
  try {
    await sStore.removeFromCollection(pack.value.id)
    pack.value = { ...pack.value, in_collection: false }
  } finally {
    actionLoading.value = false
  }
}

function goToCatalog() {
  if (pack.value) router.push('/stickers')
  emit('close')
}

function shareLink() {
  if (!pack.value) return
  const url = `${location.origin}/stickers`
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  })
}
</script>
