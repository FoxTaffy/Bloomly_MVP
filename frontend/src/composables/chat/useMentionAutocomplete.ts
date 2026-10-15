import { nextTick, onUnmounted, ref, type Ref } from 'vue'
import api from '@/api'

export interface MentionUser { id: string; username: string; display_name: string | null; avatar_url: string | null }

/** "@user" suggestions while typing in the composer. */
export function useMentionAutocomplete(draft: Ref<string>, inputEl: Ref<HTMLTextAreaElement | null>) {
  const mentionQuery = ref('')
  const mentionResults = ref<MentionUser[]>([])
  const mentionLoading = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function detectMention(text: string) {
    const match = text.match(/@([\w.-]*)$/)
    if (!match || match[1].length < 1) { closeMention(); return }
    const q = match[1]
    mentionQuery.value = q
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      mentionLoading.value = true
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}&limit=6`)
        mentionResults.value = res.data?.data?.users ?? res.data?.data ?? []
      } catch { mentionResults.value = [] }
      finally { mentionLoading.value = false }
    }, 300)
  }

  function closeMention() {
    mentionQuery.value = ''
    mentionResults.value = []
    if (timer) { clearTimeout(timer); timer = null }
  }

  function selectMention(username: string) {
    draft.value = draft.value.replace(/@[\w.-]*$/, `@${username} `)
    closeMention()
    nextTick(() => { inputEl.value?.focus() })
  }

  onUnmounted(() => { if (timer) clearTimeout(timer) })

  return { mentionQuery, mentionResults, mentionLoading, detectMention, closeMention, selectMention }
}
