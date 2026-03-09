import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Tiny store that lets MobileBottomNav trigger actions
 * that live inside MainLayout (post form, story modal).
 */
export const useMobileHubStore = defineStore('mobileHub', () => {
  const openPostForm  = ref(false)
  const openStory     = ref(false)

  function triggerPost()  { openPostForm.value = true }
  function triggerStory() { openStory.value    = true }
  function consumePost()  { openPostForm.value = false }
  function consumeStory() { openStory.value    = false }

  return { openPostForm, openStory, triggerPost, triggerStory, consumePost, consumeStory }
})
