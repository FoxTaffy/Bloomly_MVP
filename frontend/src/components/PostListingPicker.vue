<script setup lang="ts">
import { ref, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import PostListingCard from '@/components/PostListingCard.vue'
import type { PostListingPreview } from '@/lib/postListing'
import api from '@/api'

// Выбор лота Dealers' Den для поста «Обновление заказа». Показывает активные лоты этой группы;
// выбранный лот отображается так же, как будет выглядеть в ленте, с кнопкой «убрать».
const props = defineProps<{ groupId: string; canCreate?: boolean }>()
const selected = defineModel<PostListingPreview | null>({ default: null })

const open = ref(false)
const loading = ref(false)
const failed = ref(false)
const listings = ref<PostListingPreview[]>([])
let loadedFor = ''

async function load() {
  if (loadedFor === props.groupId || loading.value) return
  loading.value = true
  failed.value = false
  try {
    const { data } = await api.get('/dealers-den', { params: { groupId: props.groupId, limit: 50 } })
    listings.value = data?.data?.listings ?? []
    loadedFor = props.groupId
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) load()
}

function pick(l: PostListingPreview) {
  selected.value = l
  open.value = false
}

// Другая группа — другой список лотов и сброс выбора
watch(() => props.groupId, () => { loadedFor = ''; listings.value = []; selected.value = null; open.value = false })
</script>

<template>
  <div class="px-1" data-testid="post-listing-picker">
    <p class="text-[10px] text-white/30 font-bold uppercase tracking-wide mb-2">Товар или услуга из Dealers' Den</p>

    <PostListingCard v-if="selected" :listing="selected" :interactive="false">
      <template #actions>
        <button type="button" title="Убрать лот" aria-label="Убрать лот"
          class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-brand-card transition-colors"
          @click="selected = null">
          <BIcon name="X" class="w-4 h-4" />
        </button>
      </template>
    </PostListingCard>

    <button v-else type="button" @click="toggle"
      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-brand-border hover:border-brand-accent/40 transition-all">
      <BIcon name="ShoppingBag" class="w-4 h-4" />
      Прикрепить лот
      <BIcon name="ChevronDown" class="w-3.5 h-3.5 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>

    <div v-if="open && !selected" class="mt-2 rounded-xl border border-brand-border bg-brand-card p-2 max-h-72 overflow-y-auto stack-y-2">
      <p v-if="loading" class="text-xs text-white/40 px-2 py-3">Загружаем лоты…</p>
      <div v-else-if="failed" class="px-2 py-3 text-xs text-white/55">
        Не удалось загрузить лоты.
        <button type="button" class="text-brand-accent font-semibold hover:underline" @click="load">Повторить</button>
      </div>
      <p v-else-if="!listings.length" class="text-xs text-white/40 px-2 py-3">
        У группы пока нет активных лотов.
        <router-link v-if="canCreate" to="/dealers-den?create=1" class="text-brand-accent font-semibold hover:underline">Создать лот</router-link>
      </p>
      <div v-for="l in listings" :key="l.id" role="button" tabindex="0" class="rounded-xl focus-visible:outline-2 focus-visible:outline-brand-accent"
        @click="pick(l)" @keydown.enter.prevent="pick(l)" @keydown.space.prevent="pick(l)">
        <PostListingCard :listing="l" :interactive="false" class="hover:border-brand-accent/50 cursor-pointer" />
      </div>
    </div>
  </div>
</template>
