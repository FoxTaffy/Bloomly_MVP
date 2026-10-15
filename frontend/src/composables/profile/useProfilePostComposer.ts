import { ref, watch } from 'vue'
import api from '@/api'
import type MediaUpload from '@/components/MediaUpload.vue'
import { extractHashtags, extractCommittedHashtags } from '@/lib/hashtags'
import { useTagSuggestions } from '@/composables/useTagSuggestions'

/** Inline "new post" form on your own profile: text, media, tags, visibility, publish now or schedule. */
export function useProfilePostComposer(opts: { onCreated: (post: any) => void; onScheduled: () => void }) {
  const { onCreated, onScheduled } = opts

  const newPostContent = ref('')
  const newPostMediaUrls = ref<string[]>([])
  const newPostIsNsfw = ref(false)
  const newPostIsAiGenerated = ref(false)
  const newPostTags = ref<string[]>([])
  const newPostTagInput = ref('')
  const { suggestions: tagSuggestions, showSuggestions: showTagSuggestions, fetchSuggestions: fetchTagSuggestions, clearSuggestions: clearTagSuggestions } = useTagSuggestions()

  // Auto-pick up "#hashtag"s the user writes directly in the post text (only once
  // they've finished typing the word, not on every keystroke of a partial one)
  watch(newPostContent, (content) => {
    for (const tag of extractCommittedHashtags(content)) {
      if (!newPostTags.value.includes(tag)) newPostTags.value.push(tag)
    }
  })

  const newPostVisibility = ref('public')
  const showProfileVisibilityMenu = ref(false)
  const isCreatingPost = ref(false)
  const profileMediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)
  const showProfileScheduleMenu = ref(false)
  const isSchedulingProfilePost = ref(false)

  function addProfileTag() {
    const t = newPostTagInput.value.trim().replace(/^#/, '')
    if (t && !newPostTags.value.includes(t)) newPostTags.value.push(t)
    newPostTagInput.value = ''
    clearTagSuggestions()
  }
  function addProfileTagFromSuggestion(name: string) {
    const t = name.trim().toLowerCase()
    if (t && !newPostTags.value.includes(t)) newPostTags.value.push(t)
    newPostTagInput.value = ''
    clearTagSuggestions()
  }
  function removeProfileTag(tag: string) { newPostTags.value = newPostTags.value.filter(t => t !== tag) }

  function resetForm() {
    newPostContent.value = ''
    newPostMediaUrls.value = []
    newPostIsNsfw.value = false
    newPostIsAiGenerated.value = false
    newPostTags.value = []
    newPostTagInput.value = ''
    newPostVisibility.value = 'public'
    profileMediaUploadRef.value?.clearAll()
  }

  function onProfileMediaUploaded(urls: string[]) {
    newPostMediaUrls.value = urls
  }

  async function createPost() {
    if ((!newPostContent.value.trim() && newPostMediaUrls.value.length === 0) || isCreatingPost.value) return
    // Catch a trailing "#hashtag" that was never followed by a space/newline before hitting send
    for (const tag of extractHashtags(newPostContent.value)) {
      if (!newPostTags.value.includes(tag)) newPostTags.value.push(tag)
    }
    isCreatingPost.value = true
    try {
      const res = await api.post('/posts', {
        content: newPostContent.value.trim(),
        isNsfw: newPostIsNsfw.value,
        isAiGenerated: newPostIsAiGenerated.value,
        mediaUrls: newPostMediaUrls.value,
        tags: newPostTags.value,
        visibility: newPostVisibility.value,
      })
      if (res.data.success) {
        onCreated(res.data.data.post)
        resetForm()
      }
    } catch (e) { console.error('failed to create post', e) }
    finally { isCreatingPost.value = false }
  }

  async function saveProfileScheduledPost(payload: { scheduledAt?: string; timezone?: string }) {
    const content = newPostContent.value.trim()
    if (!content && newPostMediaUrls.value.length === 0) return
    for (const tag of extractHashtags(content)) {
      if (!newPostTags.value.includes(tag)) newPostTags.value.push(tag)
    }
    isSchedulingProfilePost.value = true
    try {
      const res = await api.post('/posts/scheduled', {
        content,
        tags: newPostTags.value,
        isNsfw: newPostIsNsfw.value,
        isAiGenerated: newPostIsAiGenerated.value,
        mediaUrls: newPostMediaUrls.value,
        ...payload,
      })
      if (res.data.success) {
        onScheduled()
        showProfileScheduleMenu.value = false
        resetForm()
      }
    } catch (e) { console.error('Failed to schedule post', e) }
    finally { isSchedulingProfilePost.value = false }
  }

  return {
    newPostContent, newPostMediaUrls, newPostIsNsfw, newPostIsAiGenerated, newPostTags, newPostTagInput,
    newPostVisibility, showProfileVisibilityMenu, isCreatingPost, profileMediaUploadRef, showProfileScheduleMenu, isSchedulingProfilePost,
    addProfileTag, addProfileTagFromSuggestion, removeProfileTag, onProfileMediaUploaded, createPost, saveProfileScheduledPost,
    tagSuggestions, showTagSuggestions, fetchTagSuggestions, clearTagSuggestions,
  }
}
