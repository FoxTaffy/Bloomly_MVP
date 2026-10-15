import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import api from '@/api'
import type { UserProfile } from '@/stores/user'

/** Avatar / banner full-screen viewers and the avatar history gallery (restore / delete past avatars). */
export function useAvatarGallery(viewedProfile: Ref<UserProfile | null>) {
  const showAvatarViewer = ref(false)
  const showBannerViewer = ref(false)

  interface GalleryItem { url: string; video_url?: string | null; created_at: string; id?: string }
  const avatarGallery        = ref<GalleryItem[]>([])
  const avatarGalleryIndex   = ref(0)
  const avatarGalleryLoading = ref(false)
  const avatarGalleryRestoring = ref(false)

  async function openAvatarGallery() {
    if (!viewedProfile.value?.avatar_url) return
    showAvatarViewer.value = true
    avatarGalleryIndex.value = 0
    avatarGalleryLoading.value = true

    const current: GalleryItem = { url: viewedProfile.value.avatar_url, video_url: viewedProfile.value.avatar_video_url, created_at: new Date().toISOString() }
    avatarGallery.value = [current]

    try {
      const res = await api.get(`/users/${viewedProfile.value.id}/media-history?type=avatar`)
      const history: GalleryItem[] = (res.data.data.history ?? []).filter((h: GalleryItem) => h.url !== current.url)
      avatarGallery.value = [current, ...history]
    } catch {
      // show just current on error
    } finally {
      avatarGalleryLoading.value = false
    }
  }

  async function restoreGalleryAvatar() {
    const item = avatarGallery.value[avatarGalleryIndex.value]
    if (!item?.id) return
    avatarGalleryRestoring.value = true
    try {
      await api.post(`/users/me/avatar-history/${item.id}/restore`)
      // Reload gallery from scratch after restore
      if (viewedProfile.value) {
        const res = await api.get(`/users/${viewedProfile.value.id}`)
        viewedProfile.value = res.data.data.user
      }
      await openAvatarGallery()
    } catch {
      // silent
    } finally {
      avatarGalleryRestoring.value = false
    }
  }

  async function deleteGalleryAvatar() {
    const item = avatarGallery.value[avatarGalleryIndex.value]
    if (!item?.id) return
    try {
      await api.delete(`/users/me/avatar-history/${item.id}`)
      avatarGallery.value.splice(avatarGalleryIndex.value, 1)
      if (avatarGalleryIndex.value >= avatarGallery.value.length) {
        avatarGalleryIndex.value = Math.max(0, avatarGallery.value.length - 1)
      }
    } catch {
      // silent
    }
  }

  watch([showAvatarViewer, showBannerViewer], ([av, bv]) => {
    document.body.style.overflow = (av || bv) ? 'hidden' : ''
  })

  function onGalleryKeydown(e: KeyboardEvent) {
    if (!showAvatarViewer.value) return
    if (e.key === 'ArrowLeft') avatarGalleryIndex.value = Math.max(0, avatarGalleryIndex.value - 1)
    else if (e.key === 'ArrowRight') avatarGalleryIndex.value = Math.min(avatarGallery.value.length - 1, avatarGalleryIndex.value + 1)
    else if (e.key === 'Escape') showAvatarViewer.value = false
  }

  onMounted(() => window.addEventListener('keydown', onGalleryKeydown))
  onUnmounted(() => {
    window.removeEventListener('keydown', onGalleryKeydown)
    document.body.style.overflow = ''
  })

  return {
    showAvatarViewer, showBannerViewer, avatarGallery, avatarGalleryIndex, avatarGalleryLoading, avatarGalleryRestoring,
    openAvatarGallery, restoreGalleryAvatar, deleteGalleryAvatar,
  }
}
