<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGroupsStore } from '@/stores/groups'
import BIcon from '@/components/BIcon.vue'

const props = defineProps<{
  groupId: string
  accentColor?: string | null
  isAdmin?: boolean
}>()

const accent = computed(() => props.accentColor || '#4C67CF')

const STAGES = [
  { key: 'скетч',  label: 'Скетч',   icon: 'Pencil',     color: '#f59e0b' },
  { key: 'линии',  label: 'Линии',    icon: 'PenTool',    color: '#3b82f6' },
  { key: 'цвет',   label: 'Цвет',     icon: 'Palette',    color: '#8b5cf6' },
  { key: 'готово', label: 'Готово',   icon: 'CheckCircle2', color: '#10b981' },
]

const groupsStore = useGroupsStore()
const columns = ref<Record<string, any[]>>({ скетч: [], линии: [], цвет: [], готово: [], unstaged: [] })
const loading = ref(true)
const error = ref('')
const expandedPostId = ref<string | null>(null)

onMounted(async () => {
  try {
    columns.value = await groupsStore.loadKanban(props.groupId)
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

const totalCards = computed(() =>
  STAGES.reduce((s, st) => s + (columns.value[st.key]?.length ?? 0), 0)
)

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

function isImage(url: string) {
  return /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(url)
}
</script>

<template>
  <div class="space-y-4">

    <!-- Header row -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <BIcon name="Kanban" class="w-4 h-4 text-white/40" />
        <p class="text-sm font-bold text-white">Канбан-борд</p>
        <span class="px-2 py-0.5 rounded-full bg-white/8 text-white/40 text-[11px] font-bold">{{ totalCards }}</span>
      </div>
      <p class="text-xs text-white/25">Обновляется из постов-WIP</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div v-for="n in 4" :key="n" class="space-y-2">
        <div class="h-7 bg-brand-bg rounded-xl animate-pulse" />
        <div v-for="m in 2" :key="m" class="h-24 bg-brand-bg rounded-2xl animate-pulse" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="py-8 text-center text-brand-error text-sm">{{ error }}</div>

    <!-- Board -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start">
      <div v-for="stage in STAGES" :key="stage.key" class="flex flex-col gap-2">

        <!-- Column header -->
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/6"
          :style="`background: ${stage.color}10`">
          <BIcon :name="stage.icon" class="w-3.5 h-3.5 flex-shrink-0" :style="`color: ${stage.color}`" />
          <span class="text-xs font-bold flex-1" :style="`color: ${stage.color}`">{{ stage.label }}</span>
          <span class="text-[10px] font-bold text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">
            {{ columns[stage.key]?.length ?? 0 }}
          </span>
        </div>

        <!-- Cards -->
        <template v-if="columns[stage.key]?.length">
          <div v-for="post in columns[stage.key]" :key="post.id"
            @click="expandedPostId = expandedPostId === post.id ? null : post.id"
            class="group bg-brand-card border border-brand-border hover:border-brand-accent/30 rounded-2xl overflow-hidden cursor-pointer transition-all shadow-sm hover:shadow-md">

            <!-- Thumbnail -->
            <div v-if="post.media_urls?.length" class="relative overflow-hidden bg-brand-bg"
              :class="expandedPostId === post.id ? 'h-40' : 'h-24'">
              <img v-if="isImage(post.media_urls[0])" :src="post.media_urls[0]"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <BIcon name="Play" class="w-6 h-6 text-white/30" />
              </div>
              <div v-if="post.media_urls.length > 1"
                class="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-1.5 py-0.5 text-[10px] text-white font-bold">
                +{{ post.media_urls.length - 1 }}
              </div>
            </div>

            <!-- Card body -->
            <div class="p-2.5 space-y-1.5">
              <p class="text-[13px] font-semibold text-white leading-snug line-clamp-2">
                {{ post.content }}
              </p>

              <!-- Expanded content -->
              <template v-if="expandedPostId === post.id">
                <div class="flex items-center gap-1.5 pt-1">
                  <img v-if="post.author?.avatar_url" :src="post.author.avatar_url"
                    class="w-5 h-5 rounded-full border border-brand-border object-cover" />
                  <div v-else class="w-5 h-5 rounded-full bg-brand-accent/20 flex items-center justify-center text-[9px] font-bold text-brand-accent">
                    {{ (post.author?.display_name || post.author?.username || '?')[0].toUpperCase() }}
                  </div>
                  <span class="text-[11px] text-white/40">{{ post.author?.display_name || post.author?.username }}</span>
                </div>
                <div class="flex items-center gap-2 text-[10px] text-white/30">
                  <span class="flex items-center gap-1">
                    <BIcon name="ChevronUp" class="w-3 h-3" />{{ post._count?.votes ?? 0 }}
                  </span>
                  <span class="flex items-center gap-1">
                    <BIcon name="MessageCircle" class="w-3 h-3" />{{ post._count?.comments ?? 0 }}
                  </span>
                  <span class="ml-auto">{{ fmtDate(post.created_at) }}</span>
                </div>
              </template>

              <!-- Collapsed footer -->
              <div v-else class="flex items-center justify-between">
                <span class="text-[10px] text-white/30">{{ fmtDate(post.created_at) }}</span>
                <div v-if="post.author?.avatar_url" class="w-4 h-4 rounded-full border border-brand-border overflow-hidden">
                  <img :src="post.author.avatar_url" class="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Empty column -->
        <div v-else class="border border-dashed border-white/8 rounded-2xl p-4 text-center">
          <BIcon :name="stage.icon" class="w-5 h-5 mx-auto mb-1.5 opacity-20" :style="`color: ${stage.color}`" />
          <p class="text-[11px] text-white/20">Пусто</p>
        </div>

      </div>
    </div>

    <!-- Unstaged hint -->
    <div v-if="!loading && (columns.unstaged?.length ?? 0) > 0"
      class="px-4 py-2.5 bg-white/3 border border-white/8 rounded-2xl flex items-center gap-2">
      <BIcon name="AlertCircle" class="w-4 h-4 text-white/30 flex-shrink-0" />
      <p class="text-xs text-white/40">
        {{ columns.unstaged.length }} WIP-{{ columns.unstaged.length === 1 ? 'пост' : 'поста' }} без стадии — выберите чип стадии при публикации
      </p>
    </div>

    <!-- Empty board hint for admin -->
    <div v-if="!loading && totalCards === 0 && isAdmin"
      class="py-10 text-center space-y-3">
      <div class="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mx-auto">
        <BIcon name="Kanban" class="w-7 h-7 text-white/20" />
      </div>
      <p class="text-white/40 text-sm font-semibold">Борд пуст</p>
      <p class="text-white/25 text-xs max-w-xs mx-auto">
        Публикуй WIP-посты с чипом стадии (Скетч / Линии / Цвет / Готово) — они автоматически появятся в нужной колонке
      </p>
    </div>

  </div>
</template>
