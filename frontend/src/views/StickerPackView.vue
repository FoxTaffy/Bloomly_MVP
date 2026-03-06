<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useStickersStore } from '@/stores/stickers'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const store  = useStickersStore()

const pack      = ref(store.currentPack)
const collected = ref(false)
const loading   = ref(true)
const toggling  = ref(false)
const lightbox  = ref<string | null>(null)

onMounted(async () => {
  const id = route.params.id as string
  loading.value = true
  try {
    pack.value = await store.loadPack(id)
    if (auth.user) {
      collected.value = await store.checkCollected(id)
    }
  } finally {
    loading.value = false
  }
})

async function toggleCollection() {
  if (!auth.user || !pack.value) return
  toggling.value = true
  try {
    if (collected.value) {
      await store.removeFromCollection(pack.value.id)
      collected.value = false
    } else {
      await store.addToCollection(pack.value.id)
      collected.value = true
    }
  } finally {
    toggling.value = false
  }
}

function isOwn() {
  return auth.user?.id === pack.value?.author_id
}

function formatPrice(price: string, currency: string) {
  const n = parseFloat(price)
  return n === 0 ? 'Бесплатно' : `${n.toLocaleString()} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20">

        <!-- Back -->
        <button
          @click="router.push({ name: 'stickers' })"
          class="flex items-center gap-2 text-white/55 hover:text-white text-sm font-semibold mb-4 transition-colors">
          <BIcon name="ArrowLeft" class="w-4 h-4" />
          Обратно к стикерам
        </button>

        <!-- Loading skeleton -->
        <div v-if="loading" class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden animate-pulse">
          <div class="w-full h-52 bg-brand-border" />
          <div class="p-6 space-y-4">
            <div class="h-6 bg-brand-border rounded-full w-1/2" />
            <div class="h-4 bg-brand-border rounded-full w-3/4" />
          </div>
        </div>

        <!-- 404 -->
        <div v-else-if="!pack" class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl">
          <BIcon name="PackageX" class="w-14 h-14 text-white/30 mx-auto mb-4" />
          <h2 class="text-2xl font-bold text-white mb-2">Пак не найден</h2>
          <p class="text-white/55 text-sm mb-6">Он мог быть удалён или скрыт</p>
          <button
            @click="router.push({ name: 'stickers' })"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-purple/80 hover:bg-brand-purple text-white text-sm font-bold rounded-xl transition-all">
            <BIcon name="Sticker" class="w-4 h-4" />
            К стикерам
          </button>
        </div>

        <!-- Pack card -->
        <div v-else class="space-y-4">
          <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">

            <!-- Header with cover -->
            <div class="relative w-full bg-brand-bg">
              <div class="w-full h-52 overflow-hidden">
                <img
                  v-if="pack.cover_url"
                  :src="pack.cover_url"
                  :alt="pack.name"
                  class="w-full h-full object-cover" />
                <div v-else-if="pack.stickers.length" class="w-full h-full flex items-center justify-center gap-3 p-4">
                  <img
                    v-for="(s, i) in pack.stickers.slice(0, 4)"
                    :key="i"
                    :src="s"
                    class="w-24 h-24 object-contain" />
                </div>
                <div v-else class="w-full h-full flex items-center justify-center">
                  <BIcon name="Sticker" class="w-24 h-24 text-brand-border" />
                </div>

                <!-- NSFW blur -->
                <div v-if="pack.is_nsfw" class="absolute inset-0 backdrop-blur-2xl flex flex-col items-center justify-center gap-2">
                  <BIcon name="EyeOff" class="w-12 h-12 text-white/50" />
                  <span class="text-white/70 font-bold">Контент 18+</span>
                </div>
              </div>
            </div>

            <!-- Content -->
            <div class="p-6 space-y-5">

              <!-- Title row -->
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="space-y-2 flex-1">
                  <div class="flex flex-wrap gap-2">
                    <span
                      class="text-xs font-extrabold px-3 py-1 rounded-full"
                      :class="parseFloat(pack.price) === 0
                        ? 'bg-brand-success/15 text-brand-success border border-brand-success/30'
                        : 'bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/30'">
                      {{ formatPrice(pack.price, pack.currency) }}
                    </span>
                    <span v-if="pack.is_nsfw" class="text-xs font-bold px-3 py-1 rounded-full border border-brand-error/30 text-brand-error bg-brand-error/10">18+</span>
                    <span v-if="pack.status === 'draft'" class="text-xs font-bold px-3 py-1 rounded-full border border-brand-warning/30 text-brand-warning bg-brand-warning/10">Черновик</span>
                  </div>
                  <h1 class="text-2xl font-extrabold text-white leading-tight">{{ pack.name }}</h1>
                  <p v-if="pack.description" class="text-sm text-white/70 leading-relaxed">{{ pack.description }}</p>
                </div>

                <!-- Add to collection button -->
                <div class="flex flex-col gap-2">
                  <button
                    v-if="auth.user && !isOwn()"
                    @click="toggleCollection"
                    :disabled="toggling"
                    class="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-2xl transition-all disabled:opacity-50"
                    :class="collected
                      ? 'bg-brand-success/15 text-brand-success border border-brand-success/30 hover:bg-brand-error/15 hover:text-brand-error hover:border-brand-error/30'
                      : 'bg-brand-purple/80 hover:bg-brand-purple text-white shadow-md shadow-brand-purple/20'">
                    <BIcon :name="collected ? 'Check' : 'Plus'" class="w-4 h-4" />
                    {{ toggling ? '…' : collected ? 'В коллекции' : 'Добавить' }}
                  </button>
                  <button
                    v-if="isOwn()"
                    @click="router.push({ name: 'stickers' })"
                    class="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-2xl bg-brand-bg border border-brand-border hover:bg-brand-border text-white transition-all">
                    <BIcon name="Pencil" class="w-4 h-4" />
                    Управление
                  </button>
                </div>
              </div>

              <!-- Stats row -->
              <div class="grid grid-cols-3 gap-3">
                <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-center">
                  <p class="text-xl font-extrabold text-white">{{ pack.stickers.length }}</p>
                  <p class="text-[10px] text-white/40 uppercase font-bold tracking-wider mt-0.5">Стикеров</p>
                </div>
                <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-center">
                  <p class="text-xl font-extrabold text-white">{{ pack.downloads_count }}</p>
                  <p class="text-[10px] text-white/40 uppercase font-bold tracking-wider mt-0.5">Добавлений</p>
                </div>
                <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-center">
                  <p class="text-xl font-extrabold text-white">{{ pack._count.userCollections }}</p>
                  <p class="text-[10px] text-white/40 uppercase font-bold tracking-wider mt-0.5">В коллекциях</p>
                </div>
              </div>

              <!-- Tags -->
              <div v-if="pack.tags.length">
                <h3 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Теги</h3>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="tag in pack.tags"
                    :key="tag"
                    class="text-xs text-brand-purple bg-brand-purple/10 border border-brand-purple/20 px-3 py-1 rounded-full">
                    #{{ tag }}
                  </span>
                </div>
              </div>

              <!-- Stickers grid -->
              <div v-if="pack.stickers.length">
                <h3 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3">Стикеры ({{ pack.stickers.length }})</h3>
                <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  <div
                    v-for="(sticker, i) in pack.stickers"
                    :key="i"
                    class="aspect-square rounded-2xl border border-brand-border bg-white/5 flex items-center justify-center cursor-zoom-in hover:border-brand-purple/40 hover:bg-brand-purple/5 transition-all p-1.5"
                    @click="lightbox = sticker">
                    <img
                      :src="sticker"
                      :alt="`Sticker ${i + 1}`"
                      class="w-full h-full object-contain" />
                  </div>
                </div>
              </div>

              <!-- Author -->
              <div
                class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center gap-3 cursor-pointer"
                @click="router.push(`/profile/${pack.author.id}`)">
                <img
                  v-if="pack.author.avatar_url"
                  :src="pack.author.avatar_url"
                  class="w-11 h-11 rounded-full object-cover border-2 border-brand-border" />
                <div v-else class="w-11 h-11 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-extrabold text-base border-2 border-brand-border">
                  {{ (pack.author.display_name ?? pack.author.username)[0].toUpperCase() }}
                </div>
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-white hover:text-brand-accent transition-colors">
                      {{ pack.author.display_name ?? pack.author.username }}
                    </span>
                    <BIcon v-if="pack.author.is_verified" name="BadgeCheck" class="w-3.5 h-3.5 text-brand-accent" />
                  </div>
                  <p class="text-xs text-white/40">Автор · Опубликован {{ formatDate(pack.created_at) }}</p>
                </div>
              </div>

            </div>
          </div>
        </div>

      </main>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <div
        v-if="lightbox"
        class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
        @click="lightbox = null">
        <img :src="lightbox" class="max-w-full max-h-full object-contain rounded-2xl" />
        <button
          @click="lightbox = null"
          class="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
          <BIcon name="X" class="w-5 h-5 text-white" />
        </button>
      </div>
    </Teleport>

  </div>
</template>
