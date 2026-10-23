<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import BIcon from './BIcon.vue'

const props = defineProps<{ groupId: string; isMine?: boolean }>()

type GroupPreview = {
  id: string
  name: string
  slug: string
  avatar_url: string | null
  banner_url: string | null
  is_verified?: boolean
  _count?: { members: number }
  members_count?: number
}

// Module-level cache shared across every card instance in the chat
const cache = new Map<string, GroupPreview | null>()
const pending = new Map<string, Promise<GroupPreview | null>>()

async function fetchGroup(id: string): Promise<GroupPreview | null> {
  if (cache.has(id)) return cache.get(id) ?? null
  if (pending.has(id)) return pending.get(id)!
  const promise = api.get(`/groups/${id}`)
    .then((res) => {
      const group = res.data?.success ? res.data.data.group : null
      cache.set(id, group)
      pending.delete(id)
      return group
    })
    .catch(() => { cache.set(id, null); pending.delete(id); return null })
  pending.set(id, promise)
  return promise
}

const router = useRouter()
const loading = ref(true)
const group = ref<GroupPreview | null>(null)

onMounted(async () => {
  group.value = await fetchGroup(props.groupId)
  loading.value = false
})

const membersCount = computed(() => group.value?._count?.members ?? group.value?.members_count ?? 0)

function open() {
  if (group.value) router.push(`/groups/${group.value.slug}`)
}
</script>

<template>
  <div
    class="mb-0.5 w-[240px] rounded-2xl overflow-hidden border border-brand-border bg-brand-bg shadow-xs cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all"
    :class="isMine ? 'rounded-br-md' : 'rounded-bl-md'"
    @click.stop="open"
  >
    <div v-if="loading" class="flex items-center justify-center py-8">
      <BIcon name="Loader2" class="w-5 h-5 text-white/30 animate-spin" />
    </div>
    <div v-else-if="!group" class="flex items-center gap-2 px-3.5 py-3 text-white/40 text-xs">
      <BIcon name="FolderX" class="w-4 h-4" /> Группа недоступна
    </div>
    <template v-else>
      <div class="relative w-full h-16 bg-linear-to-br/srgb from-brand-accent/30 to-brand-accent-plus/40 overflow-hidden">
        <img v-if="group.banner_url" :src="group.banner_url" class="absolute inset-0 w-full h-full object-cover" />
      </div>
      <div class="px-3 pb-3 -mt-6">
        <div class="w-12 h-12 rounded-2xl border-[3px] border-brand-bg overflow-hidden shadow-md bg-brand-bg">
          <img v-if="group.avatar_url" :src="group.avatar_url" class="w-full h-full object-cover" />
          <div v-else class="w-full h-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold">
            {{ (group.name || '?')[0].toUpperCase() }}
          </div>
        </div>
        <p class="text-sm font-bold text-white truncate mt-1.5 flex items-center gap-1">
          {{ group.name }}
          <BIcon v-if="group.is_verified" name="BadgeCheck" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
        </p>
        <p class="text-[11px] text-white/50 mt-0.5">{{ membersCount }} участников</p>
        <div class="mt-2.5 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-brand-accent/15 text-brand-accent text-xs font-bold">
          <BIcon name="ArrowRight" class="w-3.5 h-3.5" />
          Перейти к группе
        </div>
      </div>
    </template>
  </div>
</template>
