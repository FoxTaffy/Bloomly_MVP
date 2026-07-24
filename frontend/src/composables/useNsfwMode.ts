import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'

// Global singleton – shared across ALL components in the same tab
const _nsfwEnabled = ref(
  typeof window !== 'undefined'
    ? localStorage.getItem('bloomly_nsfw') === 'true'
    : false,
)

// Keep in sync when toggle fires in another tab
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'bloomly_nsfw') {
      _nsfwEnabled.value = e.newValue === 'true'
    }
  })
}

export function useNsfwMode() {
  const authStore = useAuthStore()
  // Server verifies this from birth_date — missing/unset counts as a minor,
  // so NSFW stays gated until the account confirms 18+.
  const canUseNsfw = computed(() => authStore.user?.is_adult === true)

  function enableNsfw() {
    if (!canUseNsfw.value) return
    _nsfwEnabled.value = true
    localStorage.setItem('bloomly_nsfw', 'true')
  }

  function disableNsfw() {
    _nsfwEnabled.value = false
    localStorage.setItem('bloomly_nsfw', 'false')
  }

  function toggleNsfw() {
    if (_nsfwEnabled.value) disableNsfw()
    else enableNsfw()
  }

  return {
    nsfwEnabled: computed(() => _nsfwEnabled.value && canUseNsfw.value),
    canUseNsfw,
    enableNsfw,
    disableNsfw,
    toggleNsfw,
  }
}
