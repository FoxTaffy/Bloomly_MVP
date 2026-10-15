import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'

export type NsfwMode = 'hide' | 'blur' | 'show'

const MODE_KEY = 'bloomly_nsfw_mode'
const LEGACY_KEY = 'bloomly_nsfw' // old boolean toggle: 'true' → show, anything else → hide
const MODES: NsfwMode[] = ['hide', 'blur', 'show']

function readStoredMode(): NsfwMode {
  if (typeof window === 'undefined') return 'hide'
  try {
    const stored = localStorage.getItem(MODE_KEY)
    if (stored && (MODES as string[]).includes(stored)) return stored as NsfwMode
    return localStorage.getItem(LEGACY_KEY) === 'true' ? 'show' : 'hide'
  } catch {
    return 'hide'
  }
}

// Global singleton – shared across ALL components in the same tab. This is the *preference*;
// the mode actually applied is `nsfwMode` below, which also depends on the viewer's age.
const _mode = ref<NsfwMode>(readStoredMode())

function storeMode(mode: NsfwMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
    localStorage.setItem(LEGACY_KEY, mode === 'show' ? 'true' : 'false')
  } catch { /* storage unavailable (private window) — preference lives for this session only */ }
}

// Keep in sync when toggle fires in another tab
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === MODE_KEY || e.key === LEGACY_KEY) _mode.value = readStoredMode()
  })
}

export function useNsfwMode() {
  const authStore = useAuthStore()
  // Server verifies this from birth_date — missing/unset counts as a minor,
  // so NSFW stays gated until the account confirms 18+. Guests are never adults.
  const canUseNsfw = computed(() => authStore.user?.is_adult === true)

  /** Mode applied to feeds and sent to the API. Guests and minors are always 'hide', whatever is stored. */
  const nsfwMode = computed<NsfwMode>(() => (canUseNsfw.value ? _mode.value : 'hide'))

  function setNsfwMode(mode: NsfwMode) {
    if (mode !== 'hide' && !canUseNsfw.value) return
    _mode.value = mode
    storeMode(mode)
  }

  function enableNsfw() { setNsfwMode('show') }
  function disableNsfw() { setNsfwMode('hide') }
  /** hide → blur → show → hide */
  function toggleNsfw() {
    setNsfwMode(MODES[(MODES.indexOf(nsfwMode.value) + 1) % MODES.length])
  }

  return {
    nsfwMode,
    /** True only in 'show' — kept so existing `v-if="nsfwEnabled"` / blur checks keep working ('blur' counts as not enabled). */
    nsfwEnabled: computed(() => nsfwMode.value === 'show'),
    canUseNsfw,
    setNsfwMode,
    enableNsfw,
    disableNsfw,
    toggleNsfw,
  }
}
