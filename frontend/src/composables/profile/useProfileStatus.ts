import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import api from '@/api'
import { useLangStore } from '@/stores/lang'
import { useUserStore } from '@/stores/user'
import { shadeColor } from '@/lib/profileDisplay'

/** IG-Notes-style status bubble on a profile: display, music preview and the owner's editor. */
export function useProfileStatus() {
  const langStore = useLangStore()
  const userStore = useUserStore()

  // ── Profile status (server-backed IG Notes-style bubble) ──────────────────────
  const profileStatus = reactive({ emoji: '', text: '', expiresAt: 0, color: '', music: null as null | { title: string; artist: string; artworkUrl: string; previewUrl: string } })
  const showStatusEdit = ref(false)
  const statusSaving = ref(false)
  const statusEditEmoji = ref('')
  const statusEditText = ref('')
  const statusEditDuration = ref(86400)
  const statusEditColor = ref('#4C67CF')
  const statusEditMusic = ref<null | { title: string; artist: string; artworkUrl: string; previewUrl: string }>(null)
  const statusEmojiTab = ref(0)
  const statusShowMusicSearch = ref(false)
  const statusMusicQuery = ref('')
  const statusMusicResults = ref<any[]>([])
  const statusMusicLoading = ref(false)
  const statusPreviewAudioEl = ref<HTMLAudioElement | null>(null)
  const isStatusMusicPlaying = ref(false)
  const statusPreviewVolume = ref(Number(localStorage.getItem('bloomly_status_preview_volume') ?? '0.7'))
  function toggleStatusMusicPreview() {
    const url = profileStatus.music?.previewUrl
    const audio = statusPreviewAudioEl.value
    if (!url || !audio) return
    if (isStatusMusicPlaying.value) {
      audio.pause()
      return
    }
    if (audio.src !== url) audio.src = url
    audio.volume = statusPreviewVolume.value
    audio.play().catch(() => {})
  }
  function setStatusMusicVolume(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value)
    if (!isFinite(v)) return
    statusPreviewVolume.value = v
    if (statusPreviewAudioEl.value) statusPreviewAudioEl.value.volume = v
    localStorage.setItem('bloomly_status_preview_volume', String(v))
  }
  // Stop any preview playing for the previous profile/track before it's replaced —
  // otherwise navigating to another user (or saving a new track on your own status)
  // leaves the old preview audio running silently while the play/pause icon flips
  // to reflect the new (unrelated) track.
  watch(() => profileStatus.music?.previewUrl, (next, prev) => {
    if (next === prev) return
    const audio = statusPreviewAudioEl.value
    if (audio) audio.pause()
    isStatusMusicPlaying.value = false
  })
  let statusMusicTimer: ReturnType<typeof setTimeout> | null = null

  const emojiCategories = [
    { label: '😊', emojis: ['😊','😎','😴','😤','🥺','😂','🥰','😈','🤔','😭','🫶','💀','👀','🫠','🥳','😶'] },
    { label: '🎮', emojis: ['🎨','🎮','🎵','📚','💻','🏃','✈️','🎬','🎲','🎸','🏋️','🎯','🎤','🧩','🛹','🎭'] },
    { label: '🍕', emojis: ['🍕','🍔','🍜','🍣','☕','🧋','🍺','🎂','🍎','🥐','🍦','🌮','🍩','🥗','🫐','🧁'] },
    { label: '🦊', emojis: ['🐾','🦊','🐱','🐶','🦄','🌙','⭐','🌈','🔥','🌿','🌊','🦋','🐺','🦁','🐼','🌸'] },
    { label: '💎', emojis: ['💎','⚡','🔑','💡','🏆','💰','❤️','💜','🖤','✅','⚠️','🔴','🟡','🟢','💬','📌'] },
  ]

  const statusBubbleColor = computed(() =>
    profileStatus.color || (profileStatus.music ? '#c0392b' : '#4C67CF')
  )
  const statusEditBubbleColor = computed(() =>
    statusEditColor.value || (statusEditMusic.value ? '#c0392b' : '#4C67CF')
  )


  const statusBubbleGradient = computed(() => `linear-gradient(135deg, ${shadeColor(statusBubbleColor.value, 16)}, ${shadeColor(statusBubbleColor.value, -20)})`)
  const statusEditBubbleGradient = computed(() => `linear-gradient(135deg, ${shadeColor(statusEditBubbleColor.value, 16)}, ${shadeColor(statusEditBubbleColor.value, -20)})`)
  // Ticks so statusTimeRemaining actually counts down and an expired status
  // disappears on its own instead of staying visible until the next page load.
  const statusNowTick = ref(Date.now())
  let statusNowTickInterval: ReturnType<typeof setInterval> | null = null
  const hasActiveStatus = computed(() => {
    if (profileStatus.expiresAt && profileStatus.expiresAt <= statusNowTick.value) return false
    return !!(profileStatus.text || profileStatus.emoji || profileStatus.music)
  })

  const statusDurations = computed(() => [
    { label: `30${langStore.t.profileDurationMinuteShort}`, value: 1800 },
    { label: `1${langStore.t.profileDurationHourShort}`, value: 3600 },
    { label: `4${langStore.t.profileDurationHourShort}`, value: 14400 },
    { label: `24${langStore.t.profileDurationHourShort}`, value: 86400 },
    { label: `7${langStore.t.profileDurationDayShort}`, value: 604800 },
    { label: '∞', value: 0 },
  ])

  const statusColors = [
    { value: '#4C67CF', dot: 'bg-brand-accent' },
    { value: '#7c3aed', dot: 'bg-[#7c3aed]' },
    { value: '#ec4899', dot: 'bg-[#ec4899]' },
    { value: '#f97316', dot: 'bg-[#f97316]' },
    { value: '#22c55e', dot: 'bg-[#22c55e]' },
    { value: '#ef4444', dot: 'bg-[#ef4444]' },
    { value: '#2c2c2e', dot: 'bg-[#2c2c2e] border border-white/20' },
  ]

  const statusTimeRemaining = computed(() => {
    if (!profileStatus.expiresAt) return ''
    const diff = profileStatus.expiresAt - statusNowTick.value
    if (diff <= 0) return ''
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (h >= 24) return `${Math.floor(h / 24)}${langStore.t.profileDurationDayShort}`
    if (h >= 1) return `${h}${langStore.t.profileDurationHourShort}`
    return `${m}${langStore.t.profileDurationMinuteShort}`
  })

  /** Populate the reactive display state from whatever the API returned for this profile (own or someone else's). */
  function applyProfileStatus(status: any) {
    profileStatus.emoji = ''; profileStatus.text = ''; profileStatus.expiresAt = 0; profileStatus.color = ''; profileStatus.music = null
    if (!status) return
    if (status.expiresAt && status.expiresAt < Date.now()) return
    profileStatus.emoji = status.emoji ?? ''
    profileStatus.text = status.text ?? ''
    profileStatus.expiresAt = status.expiresAt ?? 0
    profileStatus.color = status.color ?? ''
    profileStatus.music = status.music ?? null
  }
  async function saveProfileStatus() {
    if (statusSaving.value) return
    statusSaving.value = true
    const hasContent = !!(statusEditEmoji.value || statusEditText.value || statusEditMusic.value)
    const expiresAt = hasContent && statusEditDuration.value > 0 ? Date.now() + statusEditDuration.value * 1000 : 0
    const payload = {
      emoji: statusEditEmoji.value,
      text: statusEditText.value,
      expiresAt,
      color: statusEditColor.value,
      music: statusEditMusic.value,
    }
    try {
      await userStore.updateProfile({ profile_status: payload })
      profileStatus.emoji = payload.emoji
      profileStatus.text = payload.text
      profileStatus.expiresAt = payload.expiresAt
      profileStatus.color = payload.color
      profileStatus.music = payload.music
      showStatusEdit.value = false
    } finally {
      statusSaving.value = false
    }
  }
  function openStatusEdit() {
    statusEditEmoji.value = profileStatus.emoji
    statusEditText.value = profileStatus.text
    if (hasActiveStatus.value && profileStatus.expiresAt) {
      // Preserve the current expiry instead of silently resetting a longer-lived
      // status back down to the 24h default just because the editor was reopened.
      const remainingMs = profileStatus.expiresAt - Date.now()
      const bucket = statusDurations.value.map(d => d.value).filter(v => v > 0).find(v => v * 1000 >= remainingMs)
      statusEditDuration.value = bucket ?? statusDurations.value[statusDurations.value.length - 2].value
    } else if (hasActiveStatus.value) {
      statusEditDuration.value = 0 // was set to "forever"
    } else {
      statusEditDuration.value = 86400
    }
    statusEditColor.value = profileStatus.color || '#4C67CF'
    statusEditMusic.value = profileStatus.music
    statusShowMusicSearch.value = !!profileStatus.music
    statusMusicQuery.value = ''
    statusMusicResults.value = []
    showStatusEdit.value = true
  }
  async function clearProfileStatus() {
    if (statusSaving.value) return
    statusSaving.value = true
    try {
      await userStore.updateProfile({ profile_status: null })
      profileStatus.emoji = ''; profileStatus.text = ''; profileStatus.expiresAt = 0; profileStatus.color = ''; profileStatus.music = null
      statusEditEmoji.value = ''; statusEditText.value = ''
      showStatusEdit.value = false
    } finally {
      statusSaving.value = false
    }
  }
  function pickStatusColor(hex: string) {
    statusEditColor.value = hex
  }
  const statusMusicError = ref(false)
  function onStatusMusicSearch() {
    if (statusMusicTimer) clearTimeout(statusMusicTimer)
    if (!statusMusicQuery.value.trim()) { statusMusicResults.value = []; statusMusicLoading.value = false; statusMusicError.value = false; return }
    statusMusicLoading.value = true
    statusMusicTimer = setTimeout(async () => {
      try {
        const res = await api.get('/users/music/search', { params: { q: statusMusicQuery.value.trim() } })
        statusMusicResults.value = res.data?.data?.tracks ?? []
        statusMusicError.value = false
      } catch {
        statusMusicResults.value = []
        statusMusicError.value = true
      } finally { statusMusicLoading.value = false }
    }, 420)
  }
  function selectStatusTrack(track: any) {
    statusEditMusic.value = {
      title: track.title ?? '',
      artist: track.artist ?? '',
      artworkUrl: track.artworkUrl ?? '',
      previewUrl: track.previewUrl ?? '',
    }
    statusMusicQuery.value = ''
    statusMusicResults.value = []
  }

  onMounted(() => { statusNowTickInterval = setInterval(() => { statusNowTick.value = Date.now() }, 30000) })
  onUnmounted(() => { if (statusNowTickInterval) clearInterval(statusNowTickInterval) })

  return {
    profileStatus, showStatusEdit, statusSaving, statusEditEmoji, statusEditText, statusEditDuration,
    statusEditColor, statusEditMusic, statusEmojiTab, statusShowMusicSearch, statusMusicQuery, statusMusicResults,
    statusMusicLoading, statusPreviewAudioEl, isStatusMusicPlaying, statusPreviewVolume, toggleStatusMusicPreview, setStatusMusicVolume,
    emojiCategories, statusBubbleColor, statusEditBubbleColor, statusBubbleGradient, statusEditBubbleGradient, statusNowTick,
    hasActiveStatus, statusDurations, statusColors, statusTimeRemaining, applyProfileStatus, saveProfileStatus,
    openStatusEdit, clearProfileStatus, pickStatusColor, statusMusicError, onStatusMusicSearch, selectStatusTrack,
  }
}
