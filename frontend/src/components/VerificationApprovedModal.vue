<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import BIcon from './BIcon.vue'
import { useLangStore } from '@/stores/lang'
import { verTypeIconUrl } from '@/lib/verificationIcons'
import { verificationTypeInfo } from '@/composables/useVerificationBadge'
import { useAuthStore } from '@/stores/auth'
import { ROLE_GROUPS } from '@/lib/verificationPolicy'

const SEEN_KEY = 'bloomly_seen_verification'
// Тип в модалке создания группы
const GROUP_TYPE: Record<string, string> = { creative: 'creative', event: 'event', shop: 'shop', brand: 'brand', news: 'news' }

const langStore = useLangStore()
const auth = useAuthStore()
const router = useRouter()
const type = ref<string | null>(null)
const verifiedAt = ref<string | null>(null)
const visible = ref(false)
const lit = ref(false)
let generation = 0
let timer: ReturnType<typeof setInterval> | undefined
let animationTimer: ReturnType<typeof setTimeout> | undefined
let checking = false
let destroyed = false
const seenThisSession = new Set<string>()
const seenKey = () => `${SEEN_KEY}:${auth.user?.id ?? ''}`

const t = computed(() => langStore.t as Record<string, string>)
const roleLabel = computed(() => verificationTypeInfo(langStore.t, type.value).label)
const groups = computed(() =>
  (ROLE_GROUPS[type.value ?? ''] ?? []).map((g) => ({
    id: g,
    label: t.value['verGroup' + g.charAt(0).toUpperCase() + g.slice(1)] ?? g,
  })),
)

function close() {
  visible.value = false
  if (verifiedAt.value) {
    seenThisSession.add(`${seenKey()}:${verifiedAt.value}`)
    try { localStorage.setItem(seenKey(), verifiedAt.value) } catch {}
  }
  clearTimeout(animationTimer)
}

function createGroup() {
  const first = groups.value[0]
  close()
  router.push({ name: 'groups', query: first ? { create: GROUP_TYPE[first.id] } : { create: '1' } })
}

async function checkStatus() {
  if (!auth.user?.id || checking || destroyed || document.visibilityState === 'hidden') return
  checking = true
  const userId = auth.user.id
  const currentGeneration = generation
  try {
    const res = await api.get('/verification/status')
    const d = res.data?.data
    if (destroyed || currentGeneration !== generation || auth.user?.id !== userId) return
    if (res.data?.success && d && auth.user) {
      auth.user.is_verified = !!d?.isVerified
      auth.user.verification_type = d?.verificationType ?? null
    }
    if (visible.value) return
    if (!res.data?.success || !d?.isVerified || !d.verificationType || !d.verifiedAt) return
    if (!ROLE_GROUPS[d.verificationType]) return
    let seen: string | null = null
    try { seen = localStorage.getItem(seenKey()) } catch {}
    if (seen === d.verifiedAt || seenThisSession.has(`${seenKey()}:${d.verifiedAt}`)) return
    type.value = d.verificationType
    verifiedAt.value = d.verifiedAt
    visible.value = true
    // Помечаем сразу при показе: окно не должно вернуться, даже если его не закрыли кнопкой
    seenThisSession.add(`${seenKey()}:${d.verifiedAt}`)
    try { localStorage.setItem(seenKey(), d.verifiedAt) } catch {}
    lit.value = false
    clearTimeout(animationTimer)
    animationTimer = setTimeout(() => { lit.value = true }, 700)
  } catch {} finally {
    checking = false
    if (!destroyed && currentGeneration !== generation) void checkStatus()
  }
}

watch(() => auth.user?.id, () => {
  generation++
  visible.value = false
  lit.value = false
  clearTimeout(animationTimer)
  void checkStatus()
}, { immediate: true })

function onVisibility() { if (document.visibilityState === 'visible') void checkStatus() }
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape' && visible.value) close() }
onMounted(() => {
  timer = setInterval(checkStatus, 60_000)
  window.addEventListener('focus', checkStatus)
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  destroyed = true
  generation++
  clearInterval(timer)
  clearTimeout(animationTimer)
  window.removeEventListener('focus', checkStatus)
  document.removeEventListener('visibilitychange', onVisibility)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="vam-fade">
      <div v-if="visible" class="fixed inset-0 z-10000 flex items-center justify-center bg-black/70 backdrop-blur-xs px-4" @click.self="close">
        <div role="dialog" aria-modal="true" aria-labelledby="verification-approved-title" class="relative w-full max-w-md bg-brand-card border border-brand-border rounded-3xl shadow-2xl p-6 text-center overflow-hidden">
          <div class="vam-halo" aria-hidden="true"></div>
          <div class="relative">
            <img :src="verTypeIconUrl(type!)" :alt="type ?? ''" class="vam-icon w-20 h-20 rounded-2xl object-cover mx-auto mb-4" />
            <h2 id="verification-approved-title" class="text-xl font-extrabold text-white mb-1">{{ t.verCongratsTitle }}</h2>
            <p class="text-sm text-white/60 mb-6">{{ t.verCongratsSub.replace('{role}', roleLabel) }}</p>

            <p class="text-[11px] uppercase tracking-wider font-bold text-white/40 mb-2">{{ t.verUnlockedGroups }}</p>
            <div class="flex flex-wrap justify-center gap-2 mb-6">
              <span
                v-for="(g, i) in groups" :key="g.id"
                class="vam-chip px-3.5 py-2 rounded-xl border text-sm font-bold"
                :class="{ 'vam-chip--lit': lit }"
                :style="{ transitionDelay: i * 220 + 'ms', animationDelay: 700 + i * 220 + 'ms' }"
              >{{ g.label }}</span>
            </div>

            <button type="button" @click="createGroup"
              class="w-full py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-sm transition-colors inline-flex items-center justify-center gap-2">
              <BIcon name="Plus" class="w-4 h-4" />{{ t.verCreateGroupCta }}
            </button>
            <button type="button" @click="close" class="mt-2 w-full py-2 text-xs font-semibold text-white/40 hover:text-white/70 transition-colors">{{ t.verLater }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.vam-fade-enter-active, .vam-fade-leave-active { transition: opacity .3s ease; }
.vam-fade-enter-from, .vam-fade-leave-to { opacity: 0; }
.vam-halo {
  position: absolute; top: -80px; left: 50%; width: 260px; height: 260px; margin-left: -130px;
  background: radial-gradient(circle, rgba(59,130,246,.35), transparent 70%);
  animation: vam-pulse 3s ease-in-out infinite;
}
.vam-icon { animation: vam-pop .6s cubic-bezier(.2,1.4,.4,1) both; box-shadow: 0 0 30px rgba(59,130,246,.45); }
.vam-chip {
  color: rgba(255,255,255,.3); border-color: rgba(255,255,255,.1); background: rgba(255,255,255,.03);
  filter: grayscale(1); opacity: .55;
  transition: color .6s ease, border-color .6s ease, background .6s ease, filter .6s ease, opacity .6s ease, box-shadow .6s ease;
}
.vam-chip--lit {
  color: #bfdbfe; border-color: rgba(96,165,250,.8); background: rgba(59,130,246,.18);
  filter: none; opacity: 1; box-shadow: 0 0 18px rgba(59,130,246,.55);
  animation: vam-shine 2.4s ease-in-out infinite;
}
@keyframes vam-pop { from { transform: scale(.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes vam-pulse { 0%,100% { opacity: .6 } 50% { opacity: 1 } }
@keyframes vam-shine { 0%,100% { box-shadow: 0 0 12px rgba(59,130,246,.4) } 50% { box-shadow: 0 0 26px rgba(96,165,250,.85) } }
@media (prefers-reduced-motion: reduce) { .vam-halo, .vam-icon, .vam-chip--lit { animation: none } }
</style>
