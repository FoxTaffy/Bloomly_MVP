import { ref } from 'vue'

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
  function enableNsfw() {
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
    nsfwEnabled: _nsfwEnabled,
    enableNsfw,
    disableNsfw,
    toggleNsfw,
  }
}
