import { computed, ref, watch, type Ref } from 'vue'
import api from '@/api'
import { useUserStore, type Fursona, type Fursuit, type UserProfile } from '@/stores/user'
import { useLangStore } from '@/stores/lang'

/** Fursonas (up to 10, one selected), fursuits with their makers, and the reference-image viewer of a profile. */
export function useProfileFursonas(viewedProfile: Ref<UserProfile | null>) {
  const userStore = useUserStore()
  const langStore = useLangStore()

  // Up to 10 characters per user; `selectedFursonaId` drives which one the hero card shows.
  const profileFursonas = ref<Fursona[]>([])
  const selectedFursonaId = ref<string | null>(null)
  const profileFursona = computed(() =>
    profileFursonas.value.find((f) => f.id === selectedFursonaId.value) ?? profileFursonas.value[0] ?? null
  )
  function speciesDisplay(sp: string): string {
    return sp === 'Other' && profileFursona.value?.species_other ? profileFursona.value.species_other : sp
  }
  function speciesSummary(f: Fursona): string {
    return f.species?.length ? speciesDisplay(f.species[0]) : ''
  }
  const profileFursuits = ref<Fursuit[]>([])
  const profileFursonaLoading = ref(false)
  const profileFursuitsLoading = ref(false)
  const makerGroupCache = ref<Record<string, { id: string; slug: string; name: string; avatar_url: string | null }>>({})


  async function loadProfileFursonas(userId: string) {
    profileFursonaLoading.value = true
    try {
      const res = await api.get(`/users/${userId}/fursonas`)
      profileFursonas.value = res.data.success ? (res.data.data.fursonas ?? []) : []
      selectedFursonaId.value = profileFursonas.value.find((f) => f.is_primary)?.id ?? profileFursonas.value[0]?.id ?? null
    } catch {
      profileFursonas.value = []
      selectedFursonaId.value = null
    } finally {
      profileFursonaLoading.value = false
    }
  }

  watch(selectedFursonaId, async (id) => {
    const userId = viewedProfile.value?.id
    if (!id || !userId) { userStore.referenceImages = []; return }
    await userStore.fetchReferenceImages(userId, id)
  })

  async function loadProfileFursuits(userId: string) {
    profileFursuitsLoading.value = true
    try {
      const res = await api.get(`/users/${userId}/fursuits`)
      if (res.data.success) profileFursuits.value = res.data.data.fursuits ?? []
      else profileFursuits.value = []
      // Resolve maker_ids → group info (for pill badges)
      const uniqueIds = [...new Set(profileFursuits.value.filter(s => s.maker_id).map(s => s.maker_id!))]
      await Promise.all(uniqueIds.map(async (id) => {
        if (makerGroupCache.value[id]) return
        try {
          const gr = await api.get(`/groups/${id}`)
          if (gr.data.success && gr.data.data.group) {
            makerGroupCache.value[id] = gr.data.data.group
          }
        } catch { /* not a group or no access, skip */ }
      }))
    } catch { profileFursuits.value = [] }
    finally { profileFursuitsLoading.value = false }
  }

  const showFursonaRefViewer = ref(false)
  const selectedFursonaRef = ref('')
  const fursonaSubTab = ref<'info' | 'personality' | 'features'>('personality')

  const fursonaRefImages = computed(() =>
    Array.from(new Set(userStore.referenceImages.map((r) => r.image_url).filter(Boolean))),
  )

  const activeFursonaRef = computed(() => selectedFursonaRef.value || fursonaRefImages.value[0] || '')
  const fursonaOtherCount = computed(() => Math.max(0, fursonaRefImages.value.length - 1))

  const fursonaViewTabs = computed(() => [
    { key: 'personality' as const, label: langStore.t.profilePersonalityLabel, count: ((profileFursona.value?.likes?.length ?? 0) + (profileFursona.value?.dislikes?.length ?? 0)) },
    { key: 'info' as const,        label: langStore.t.informationLabel },
    { key: 'features' as const,    label: langStore.t.colorPaletteLabel, count: profileFursona.value?.colors?.length ?? 0 },
  ])

  const fursonaRefPalette = computed(() =>
    Array.from(new Set((profileFursona.value?.colors ?? []).filter((v) => /^#[0-9A-Fa-f]{6}$/.test(v)))),
  )

  function selectFursonaRef(url: string) {
    selectedFursonaRef.value = url
  }

  function openFursonaRef(url?: string) {
    const next = url ?? activeFursonaRef.value
    if (!next) return
    selectedFursonaRef.value = next
    showFursonaRefViewer.value = true
  }

  watch(fursonaRefImages, (list) => {
    if (!list.length) {
      selectedFursonaRef.value = ''
      return
    }
    if (!selectedFursonaRef.value || !list.includes(selectedFursonaRef.value)) {
      selectedFursonaRef.value = list[0]
    }
  })

  return {
    profileFursonas, selectedFursonaId, profileFursona, speciesDisplay, speciesSummary, profileFursuits,
    profileFursonaLoading, profileFursuitsLoading, makerGroupCache, loadProfileFursonas, loadProfileFursuits, showFursonaRefViewer,
    selectedFursonaRef, fursonaSubTab, fursonaRefImages, activeFursonaRef, fursonaOtherCount, fursonaViewTabs,
    fursonaRefPalette, selectFursonaRef, openFursonaRef,
  }
}
