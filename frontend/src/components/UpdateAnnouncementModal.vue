<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'
import BIcon from './BIcon.vue'
import { sanitizeHtml } from '@/utils/sanitizeHtml'

interface BloomlyUpdate {
  id: string
  title: string
  body: string | null
  image_url: string | null
  created_at: string
  is_active: boolean
}

const SEEN_KEY = 'bloomly_seen_stories'

const update = ref<BloomlyUpdate | null>(null)
const visible = ref(false)

function isSeen(id: string): boolean {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return false
    return (JSON.parse(raw) as string[]).includes(id)
  } catch { return false }
}

function markSeen(id: string) {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const ids = new Set<string>(raw ? JSON.parse(raw) : [])
    ids.add(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]))
  } catch {}
}

onMounted(async () => {
  try {
    const res = await api.get('/updates')
    if (!res.data.success) return
    const updates: BloomlyUpdate[] = res.data.data.updates ?? []
    const latest = updates[0]
    if (latest && !isSeen(latest.id)) {
      update.value = latest
      visible.value = true
    }
  } catch {}
})

const close = () => {
  if (update.value) markSeen(update.value.id)
  visible.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible && update"
        class="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        @click.self="close"
      >
        <Transition
          appear
          enter-active-class="transition duration-250 ease-out"
          enter-from-class="opacity-0 scale-95 translate-y-3"
          enter-to-class="opacity-100 scale-100 translate-y-0"
        >
          <div class="relative w-full max-w-md max-h-[85vh] rounded-3xl overflow-hidden border border-white/10 bg-[#12121f] shadow-2xl flex flex-col">
            <!-- Close — pinned outside the scroll area so it's always reachable -->
            <button
              @click="close"
              aria-label="Закрыть"
              class="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10
                flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
            >
              <BIcon name="X" class="w-4 h-4" />
            </button>

            <!-- Scrollable body — image + text can be arbitrarily long -->
            <div class="overflow-y-auto">
              <!-- Cover -->
              <img v-if="update.image_url" :src="update.image_url" class="w-full aspect-[3/1] object-cover flex-shrink-0" />
              <div v-else class="w-full aspect-[3/1] bg-gradient-to-br from-[#4C67CF] via-[#7c3aed] to-[#4C67CF] flex items-center justify-center flex-shrink-0">
                <span class="text-white font-black text-5xl select-none" style="font-family:system-ui,sans-serif;letter-spacing:-2px">B</span>
              </div>

              <!-- Content -->
              <div class="px-6 py-5">
                <div class="flex items-center gap-1.5 mb-2.5">
                  <div class="w-4 h-4 rounded-md bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center flex-shrink-0">
                    <span class="text-white font-black text-[8px]">B</span>
                  </div>
                  <span class="text-xs font-bold text-brand-accent">Обновление Bloomly</span>
                </div>
                <h2 class="text-lg font-extrabold text-white leading-tight mb-2">{{ update.title }}</h2>
                <p v-if="update.body" class="text-sm text-white/70 leading-relaxed mb-5 update-body" v-html="sanitizeHtml(update.body)" />

                <button
                  @click="close"
                  class="w-full py-2.5 rounded-2xl font-bold text-sm text-white transition-all hover:opacity-90"
                  style="background:linear-gradient(135deg,#4C67CF,#7c3aed)"
                >
                  Хорошо, понятно
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.update-body :deep(ul) { list-style: disc; padding-left: 1.25rem; margin: 0.4rem 0; }
.update-body :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.4rem 0; }
.update-body :deep(div),
.update-body :deep(p) { margin: 0.5rem 0; }
.update-body :deep(div:first-child),
.update-body :deep(p:first-child) { margin-top: 0; }
.update-body :deep(b),
.update-body :deep(strong) { font-weight: 800; color: white; }
.update-body { white-space: pre-line; }
</style>
