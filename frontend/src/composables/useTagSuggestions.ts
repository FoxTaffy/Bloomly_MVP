import { ref } from 'vue'
import api from '@/api'

export interface TagSuggestion {
  name: string
  count: number
}

/** Debounced tag-name autocomplete, ranked by how many posts use each tag. */
export function useTagSuggestions() {
  const suggestions = ref<TagSuggestion[]>([])
  const showSuggestions = ref(false)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let requestSeq = 0

  function fetchSuggestions(query: string) {
    if (debounceTimer) clearTimeout(debounceTimer)
    const q = query.trim().replace(/^#/, '')
    if (!q) {
      suggestions.value = []
      showSuggestions.value = false
      return
    }
    const seq = ++requestSeq
    debounceTimer = setTimeout(async () => {
      try {
        const res = await api.get('/posts/tags/suggest', { params: { q } })
        if (seq !== requestSeq) return // stale response, a newer query superseded it
        if (res.data.success) {
          suggestions.value = res.data.data.tags
          showSuggestions.value = suggestions.value.length > 0
        }
      } catch {
        if (seq === requestSeq) suggestions.value = []
      }
    }, 200)
  }

  function clearSuggestions() {
    suggestions.value = []
    showSuggestions.value = false
  }

  return { suggestions, showSuggestions, fetchSuggestions, clearSuggestions }
}
