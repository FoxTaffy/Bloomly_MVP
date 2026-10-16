<script setup lang="ts">
import { ref, watchEffect, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { useConfirm } from '@/composables/useConfirm'
import { safeHref } from '@/utils/safeHref'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()
const { confirmDialog } = useConfirm()
const { badges } = useAdminContext()

// ── Ads ────────────────────────────────────────────────────────────────
const ads = ref<any[]>([])
const isLoadingAds = ref(false)
const newAd = ref({ title: '', description: '', linkUrl: '', imageUrl: '', priceLabel: '' })
const showAdForm = ref(false)
const isSubmittingAd = ref(false)

const fetchAds = async () => {
  isLoadingAds.value = true
  try {
    const res = await api.get('/admin/ads')
    if (res.data.success) ads.value = res.data.data.ads
  } catch {} finally { isLoadingAds.value = false }
}

const submitAd = async () => {
  if (!newAd.value.title || !newAd.value.linkUrl) return
  isSubmittingAd.value = true
  try {
    const res = await api.post('/admin/ads', {
      title: newAd.value.title,
      description: newAd.value.description || undefined,
      linkUrl: newAd.value.linkUrl,
      imageUrl: newAd.value.imageUrl || undefined,
      priceLabel: newAd.value.priceLabel || undefined,
    })
    if (res.data.success) {
      ads.value.unshift(res.data.data.ad)
      newAd.value = { title: '', description: '', linkUrl: '', imageUrl: '', priceLabel: '' }
      showAdForm.value = false
    }
  } catch {} finally { isSubmittingAd.value = false }
}

const deleteAd = async (adId: string) => {
  if (!(await confirmDialog(langStore.t.adminConfirmDeleteAd, { danger: true }))) return
  try {
    await api.delete(`/admin/ads/${adId}`)
    ads.value = ads.value.filter(a => a.id !== adId)
  } catch {}
}

const reviewAd = async (adId: string, status: 'active' | 'rejected') => {
  try {
    const body: any = { status }
    if (status === 'active') {
      body.startsAt = new Date().toISOString()
      body.endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
    await api.patch(`/admin/ads/${adId}/review`, body)
    const a = ads.value.find(a => a.id === adId)
    if (a) a.status = status
  } catch {}
}

// ── Banners ───────────────────────────────────────────────────────────
const banners = ref<any[]>([])
const isLoadingBanners = ref(false)
const showBannerForm = ref(false)
const editingBannerId = ref<string | null>(null)
const bannerForm = ref({ title: '', subtitle: '', tag_label: '', image_url: '', link_url: '', price_label: '', gradient: '', sort_order: 0, is_active: true })
const bannerError = ref('')

const fetchBanners = async () => {
  isLoadingBanners.value = true
  try {
    const res = await api.get('/admin/sticker-banners')
    if (res.data.success) banners.value = res.data.data.banners
  } catch {} finally { isLoadingBanners.value = false }
}

const openBannerCreate = () => {
  editingBannerId.value = null
  bannerForm.value = { title: '', subtitle: '', tag_label: '', image_url: '', link_url: '', price_label: '', gradient: '', sort_order: banners.value.length, is_active: true }
  bannerError.value = ''
  showBannerForm.value = true
}

const openBannerEdit = (b: any) => {
  editingBannerId.value = b.id
  bannerForm.value = { title: b.title, subtitle: b.subtitle || '', tag_label: b.tag_label || '', image_url: b.image_url, link_url: b.link_url || '', price_label: b.price_label || '', gradient: b.gradient || '', sort_order: b.sort_order, is_active: b.is_active }
  bannerError.value = ''
  showBannerForm.value = true
}

const saveBanner = async () => {
  bannerError.value = ''
  try {
    if (editingBannerId.value) {
      const res = await api.patch(`/admin/sticker-banners/${editingBannerId.value}`, bannerForm.value)
      if (res.data.success) {
        const idx = banners.value.findIndex(b => b.id === editingBannerId.value)
        if (idx !== -1) banners.value[idx] = res.data.data.banner
        showBannerForm.value = false
      }
    } else {
      const res = await api.post('/admin/sticker-banners', bannerForm.value)
      if (res.data.success) {
        banners.value.push(res.data.data.banner)
        showBannerForm.value = false
      }
    }
  } catch (e: any) {
    if (e?.response?.data?.code === 'LIMIT') bannerError.value = langStore.t.adminBannerLimitReached
    else bannerError.value = langStore.t.adminSaveError
  }
}

const deleteBanner = async (id: string) => {
  if (!(await confirmDialog(langStore.t.adminConfirmDeleteBanner, { danger: true }))) return
  try {
    await api.delete(`/admin/sticker-banners/${id}`)
    banners.value = banners.value.filter(b => b.id !== id)
  } catch {}
}

const toggleBannerActive = async (b: any) => {
  try {
    const res = await api.patch(`/admin/sticker-banners/${b.id}`, { is_active: !b.is_active })
    if (res.data.success) {
      const idx = banners.value.findIndex(x => x.id === b.id)
      if (idx !== -1) banners.value[idx] = res.data.data.banner
    }
  } catch {}
}

// Ads tab has two views: paid ad slots, or promo banners
const adsViewMode = ref<'ads' | 'banners'>('ads')
const switchAdsView = (mode: typeof adsViewMode.value) => {
  adsViewMode.value = mode
  if (mode === 'banners' && !banners.value.length) fetchBanners()
}

onActivated(() => { if (!ads.value.length) fetchAds() })
watchEffect(() => { badges.ads = ads.value.filter((a: any) => a.status === 'pending').length })
</script>

<template>
  <div>
    <!-- Segmented toggle: ad slots vs promo banners (merged from the old separate tab) -->
    <div class="flex items-center gap-2 mb-5 p-1 rounded-2xl bg-white/[0.04] w-fit">
      <button type="button" @click="switchAdsView('ads')"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        :class="adsViewMode === 'ads' ? 'bg-orange-500/20 text-orange-400' : 'text-white/40 hover:text-white/70'">
        <BIcon name="Megaphone" class="w-3.5 h-3.5" /> {{ langStore.t.adLabel }}
      </button>
      <button type="button" @click="switchAdsView('banners')"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        :class="adsViewMode === 'banners' ? 'bg-violet-500/20 text-violet-400' : 'text-white/40 hover:text-white/70'">
        <BIcon name="Image" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavBanners }}
        <span v-if="banners.length" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          :class="adsViewMode === 'banners' ? 'bg-violet-400/20 text-violet-300' : 'bg-white/10 text-white/40'">{{ banners.length }}/7</span>
      </button>
    </div>

    <template v-if="adsViewMode === 'ads'">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <p class="text-xs text-white/35 font-semibold">{{ ads.length }} {{ langStore.t.adminAdsCountSuffix }}</p>
      <button @click="showAdForm = !showAdForm"
        class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg text-white"
        style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 16px rgba(76,103,207,0.3)">
        <BIcon name="Plus" class="w-3.5 h-3.5" /> {{ langStore.t.adminCreateBtn }}
      </button>
    </div>

    <!-- Где показывается: мини-визуал мест размещения -->
    <div class="rounded-3xl border border-brand-border p-5 mb-5" style="background:#1F223C">
      <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">{{ langStore.t.adminAdShowsWhereTitle }}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <!-- Лента (hero) -->
        <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
          <div class="w-full h-14 rounded-xl bg-white/5 flex overflow-hidden mb-2">
            <div class="w-10 h-full bg-white/10 flex-shrink-0" />
            <div class="flex-1 px-2 py-1.5 space-y-1">
              <div class="h-1.5 w-8 rounded-full bg-[#4C67CF]/50" />
              <div class="h-1.5 w-16 rounded-full bg-white/25" />
            </div>
          </div>
          <p class="text-[11px] font-bold text-white/70">{{ langStore.t.adminAdSlotFeedTop }}</p>
          <p class="text-[10px] text-white/30">{{ langStore.t.adminAdSlotFeedTopDesc }}</p>
          <p class="text-[10px] font-bold text-[#4C67CF] mt-1">{{ langStore.t.adminAdSlotFeedTopPrice }}</p>
        </div>
        <!-- Левый сайдбар -->
        <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
          <div class="w-full h-14 rounded-xl bg-white/5 flex flex-col overflow-hidden mb-2 p-1.5 gap-1">
            <div class="h-2 w-10 rounded bg-white/10" />
            <div class="h-2 w-8 rounded bg-white/10" />
            <div class="h-2 w-9 rounded bg-[#4C67CF]/40" />
          </div>
          <p class="text-[11px] font-bold text-white/70">{{ langStore.t.adminAdSlotSidebarLeft }}</p>
          <p class="text-[10px] text-white/30">{{ langStore.t.adminAdSlotSidebarLeftDesc }}</p>
          <p class="text-[10px] font-bold text-[#4C67CF] mt-1">{{ langStore.t.adminAdSlotSidebarLeftPrice }}</p>
        </div>
        <!-- Правый сайдбар -->
        <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
          <div class="w-full h-14 rounded-xl bg-white/5 flex flex-col overflow-hidden mb-2 p-1.5 gap-1">
            <div class="h-2 w-9 rounded bg-[#4C67CF]/40" />
            <div class="h-2 w-full rounded bg-white/10" />
            <div class="h-2 w-7 rounded bg-white/10" />
          </div>
          <p class="text-[11px] font-bold text-white/70">{{ langStore.t.adminAdSlotSidebarRight }}</p>
          <p class="text-[10px] text-white/30">{{ langStore.t.adminAdSlotSidebarRightDesc }}</p>
          <p class="text-[10px] font-bold text-[#4C67CF] mt-1">{{ langStore.t.adminAdSlotSidebarRightPrice }}</p>
        </div>
        <!-- Страница групп -->
        <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
          <div class="w-full h-14 rounded-xl bg-white/5 flex overflow-hidden mb-2">
            <div class="w-10 h-full bg-white/10 flex-shrink-0" />
            <div class="flex-1 px-2 py-1.5 space-y-1">
              <div class="h-1.5 w-8 rounded-full bg-[#4C67CF]/50" />
              <div class="h-1.5 w-16 rounded-full bg-white/25" />
            </div>
          </div>
          <p class="text-[11px] font-bold text-white/70">{{ langStore.t.adminAdSlotGroupsPage }}</p>
          <p class="text-[10px] text-white/30">{{ langStore.t.adminAdSlotGroupsPageDesc }}</p>
          <p class="text-[10px] font-bold text-[#4C67CF] mt-1">{{ langStore.t.adminAdSlotGroupsPagePrice }}</p>
        </div>
      </div>
      <p class="text-[11px] text-white/25 mt-3">{{ langStore.t.adminAdSlotsDisclaimer }}</p>
    </div>

    <!-- Create form -->
    <Transition name="filter-expand">
      <div v-if="showAdForm"
        class="rounded-3xl border border-[#4C67CF]/20 p-6 mb-5 shadow-xl"
        style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))">
        <h4 class="font-extrabold text-sm text-white mb-4">{{ langStore.t.adminNewAdTitle }}</h4>
        <div class="space-y-3">
          <input v-model="newAd.title" :placeholder="langStore.t.adminTitlePlaceholderRequired"
            class="adm-input" />
          <textarea v-model="newAd.description" :placeholder="langStore.t.adminDescriptionPlaceholder"
            class="adm-input resize-none h-20" />
          <input v-model="newAd.linkUrl" type="url" :placeholder="langStore.t.adminLinkPlaceholderRequired"
            class="adm-input" />
          <input v-model="newAd.priceLabel" :placeholder="langStore.t.adminPriceLabelPlaceholderExample"
            class="adm-input" />
          <div>
            <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">{{ langStore.t.adminImageOptionalLabel }}</p>
            <div v-if="newAd.imageUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/[0.08] rounded-2xl">
              <img :src="newAd.imageUrl" class="w-16 h-12 object-cover rounded-xl flex-shrink-0" />
              <span class="flex-1 text-xs text-white/45 truncate">{{ langStore.t.adminUploadedLabel }}</span>
              <button @click="newAd.imageUrl = ''" class="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-rose-500/20 flex items-center justify-center transition-all">
                <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
              </button>
            </div>
            <MediaUpload v-else type="banners" @uploaded="(urls) => newAd.imageUrl = urls[0] ?? ''" />
          </div>
        </div>

        <!-- Live preview: exactly how the card renders on-site -->
        <div v-if="newAd.title" class="mt-4">
          <p class="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1.5">{{ langStore.t.adminCardPreviewLabel }}</p>
          <div class="max-w-xs bg-brand-card border border-brand-accent/25 rounded-3xl overflow-hidden shadow-xl">
            <img v-if="newAd.imageUrl" :src="newAd.imageUrl" class="w-full object-cover max-h-28" />
            <div class="px-4 py-3">
              <span class="text-[9px] font-bold uppercase tracking-wider text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">{{ langStore.t.adLabel }}</span>
              <p class="text-xs font-bold text-white leading-snug mt-1.5">{{ newAd.title }}</p>
              <p v-if="newAd.description" class="text-[11px] text-white/55 mt-0.5 line-clamp-2">{{ newAd.description }}</p>
              <p v-if="newAd.priceLabel" class="text-[11px] font-bold text-[#4C67CF] mt-1">{{ newAd.priceLabel }}</p>
            </div>
          </div>
        </div>

        <div class="flex gap-2 justify-end mt-4">
          <button @click="showAdForm = false"
            class="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white hover:bg-white/5 border border-white/[0.08] transition-all">{{ langStore.t.cancel }}</button>
          <button @click="submitAd" :disabled="isSubmittingAd || !newAd.title || !newAd.linkUrl"
            class="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-lg"
            style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 12px rgba(76,103,207,0.3)">
            {{ isSubmittingAd ? '...' : langStore.t.adminCreateBtn }}
          </button>
        </div>
      </div>
    </Transition>

    <div v-if="isLoadingAds" class="space-y-3">
      <div v-for="n in 3" :key="n" class="h-24 rounded-3xl bg-white/5 animate-pulse" />
    </div>
    <div v-else-if="ads.length === 0"
      class="flex flex-col items-center gap-3 py-20 text-white/25">
      <BIcon name="Megaphone" class="w-10 h-10 opacity-40" />
      <p class="text-sm font-semibold">{{ langStore.t.adminNoAdsFound }}</p>
    </div>
    <div v-else class="space-y-3">
      <div v-for="ad in ads" :key="ad.id"
        class="rounded-3xl border border-brand-border p-4 flex items-start gap-4 hover:border-white/10 transition-all"
        style="background:#1F223C">
        <img v-if="ad.image_url" :src="ad.image_url" class="w-16 h-16 rounded-2xl object-cover border border-white/[0.08] flex-shrink-0" />
        <div v-else class="w-16 h-16 rounded-2xl bg-white/5 border border-white/[0.08] flex-shrink-0 flex items-center justify-center">
          <BIcon name="Image" class="w-5 h-5 text-white/20" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-xs font-extrabold px-2 py-0.5 rounded-full border"
              :class="ad.status==='active'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : ad.status==='pending'
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : 'text-white/30 bg-white/5 border-white/10'">
              {{ ad.status }}
            </span>
            <span class="text-[10px] text-white/30">{{ ad.impressions ?? 0 }} {{ langStore.t.adminImpressionsSuffix }} · {{ ad.clicks ?? 0 }} {{ langStore.t.adminClicksSuffix }}</span>
            <span v-if="ad.price_label" class="text-[10px] font-bold text-[#4C67CF] bg-[#4C67CF]/10 px-2 py-0.5 rounded-full border border-[#4C67CF]/20">{{ ad.price_label }}</span>
          </div>
          <p class="font-bold text-sm text-white">{{ ad.title }}</p>
          <p v-if="ad.description" class="text-xs text-white/40 mt-0.5 line-clamp-1">{{ ad.description }}</p>
          <a :href="safeHref(ad.link_url)" target="_blank"class="text-xs text-[#4C67CF] hover:text-[#4C67CF]/80 mt-0.5 block truncate transition-colors">{{ ad.link_url }}</a>
          <div class="flex items-center gap-2 mt-1.5 flex-wrap">
            <router-link v-if="ad.requester" :to="`/profile/${ad.requester.username}`" target="_blank"
              class="text-[11px] text-white/35 hover:text-white/60 transition-colors">
              {{ langStore.t.adminFromPrefix }} @{{ ad.requester.username }}
            </router-link>
            <span v-if="ad.contact_info" class="text-[11px] text-white/25">· {{ langStore.t.adminContactLabel }} {{ ad.contact_info }}</span>
          </div>
        </div>
        <div class="flex flex-col gap-2 flex-shrink-0">
          <template v-if="ad.status === 'pending'">
            <button @click="reviewAd(ad.id, 'active')"
              class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
              {{ langStore.t.adminApproveBtn }}
            </button>
            <button @click="reviewAd(ad.id, 'rejected')"
              class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-all">
              {{ langStore.t.adminRejectBtn }}
            </button>
          </template>
          <button @click="deleteAd(ad.id)" :title="langStore.t.deleteBtn"
            class="w-7 h-7 rounded-xl bg-white/5 border border-white/[0.08] text-white/40 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/20 flex items-center justify-center transition-all self-end">
            <BIcon name="Trash2" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
    </template>

    <template v-else>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <p class="text-xs text-white/35 font-semibold">{{ banners.length }}/7 {{ langStore.t.adminBannersCountSuffix }}</p>
      </div>
      <button @click="openBannerCreate" :disabled="banners.length >= 7"
        class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
        style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 16px rgba(76,103,207,0.3)">
        <BIcon name="Plus" class="w-3.5 h-3.5" /> {{ langStore.t.adminNewBannerBtn }}
      </button>
    </div>

    <!-- Form -->
    <div v-if="showBannerForm"
      class="rounded-3xl border border-[#a78bfa]/20 p-6 mb-5 shadow-xl"
      style="background:linear-gradient(135deg,rgba(139,92,246,0.08),rgba(99,102,241,0.04))">
      <h3 class="font-extrabold text-sm text-white mb-5">
        {{ editingBannerId ? langStore.t.adminEditBannerTitle : langStore.t.adminCreateBannerTitle }}
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminTitlePlaceholderRequired }}</label>
          <input v-model="bannerForm.title" :placeholder="langStore.t.adminBannerTitlePlaceholderExample" class="adm-input" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminSubtitleLabel }}</label>
          <input v-model="bannerForm.subtitle" :placeholder="langStore.t.adminShortDescPlaceholder" class="adm-input" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminTagPillLabel }}</label>
          <input v-model="bannerForm.tag_label" :placeholder="langStore.t.adminTagPlaceholderExample" class="adm-input" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminPriceOrCaptionLabel }}</label>
          <input v-model="bannerForm.price_label" :placeholder="langStore.t.adminPricePlaceholderExample" class="adm-input" />
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminBannerImageLabel }}</label>
          <div v-if="bannerForm.image_url" class="flex items-center gap-3 p-3 bg-white/5 border border-white/[0.08] rounded-2xl">
            <img :src="bannerForm.image_url" class="w-20 h-12 object-cover rounded-xl flex-shrink-0 border border-white/10" />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-white/60">{{ langStore.t.adminImageUploadedLabel }}</p>
              <p class="text-[10px] text-white/30 truncate mt-0.5">{{ bannerForm.image_url }}</p>
            </div>
            <button type="button" @click="bannerForm.image_url = ''"
              class="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-rose-500/20 flex items-center justify-center transition-all flex-shrink-0">
              <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
            </button>
          </div>
          <MediaUpload v-else type="banners" @uploaded="(urls) => bannerForm.image_url = urls[0] ?? ''" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.copyLinkBtn }}</label>
          <input v-model="bannerForm.link_url" placeholder="/stickers?tag=spring" class="adm-input" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminGradientCssLabel }}</label>
          <input v-model="bannerForm.gradient" placeholder="linear-gradient(135deg,#FF6B9D,#C62A88)" class="adm-input" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminSortOrderLabel }}</label>
          <input v-model.number="bannerForm.sort_order" type="number" min="0" class="adm-input" />
        </div>
        <div class="flex items-end pb-0.5">
          <button type="button" @click="bannerForm.is_active = !bannerForm.is_active"
            class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all"
            :class="bannerForm.is_active
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-white/5 text-white/40 border-white/[0.08]'">
            <BIcon :name="bannerForm.is_active ? 'Eye' : 'EyeOff'" class="w-4 h-4" />
            {{ bannerForm.is_active ? langStore.t.activeLabel : langStore.t.adminHiddenLabel }}
          </button>
        </div>
      </div>

      <!-- Live preview -->
      <div v-if="bannerForm.gradient || bannerForm.image_url"
        class="mt-5 rounded-2xl overflow-hidden h-28 relative border border-white/[0.08]">
        <img v-if="bannerForm.image_url" :src="bannerForm.image_url" class="absolute inset-0 w-full h-full object-cover" />
        <div class="absolute inset-0" :style="bannerForm.gradient ? `background:${bannerForm.gradient};opacity:0.65` : 'background:#1a1a2e'" />
        <div class="absolute inset-0 p-4 flex flex-col justify-end">
          <span v-if="bannerForm.tag_label"
            class="self-start mb-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
            {{ bannerForm.tag_label }}
          </span>
          <p class="text-white font-extrabold text-base leading-tight drop-shadow">{{ bannerForm.title || langStore.t.adminTitleFallbackLabel }}</p>
          <p v-if="bannerForm.subtitle" class="text-white/75 text-xs mt-0.5 drop-shadow">{{ bannerForm.subtitle }}</p>
        </div>
        <div class="absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-black/50 text-white/60">
          PREVIEW
        </div>
      </div>

      <p v-if="bannerError" class="text-rose-400 text-xs mt-3 font-semibold">{{ bannerError }}</p>

      <div class="flex gap-3 mt-5">
        <button @click="saveBanner"
          class="px-5 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg transition-all"
          style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 14px rgba(76,103,207,0.35)">
          {{ langStore.t.adminSaveBtn }}
        </button>
        <button @click="showBannerForm = false"
          class="px-5 py-2.5 rounded-2xl text-sm font-bold bg-white/5 border border-white/[0.08] text-white/50 hover:text-white transition-all">
          {{ langStore.t.cancel }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoadingBanners" class="space-y-3">
      <div v-for="n in 3" :key="n" class="h-28 rounded-3xl bg-white/5 animate-pulse" />
    </div>

    <!-- Empty -->
    <div v-else-if="!banners.length && !showBannerForm"
      class="flex flex-col items-center gap-4 py-24 text-white/25">
      <div class="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center">
        <BIcon name="Image" class="w-8 h-8 opacity-50" />
      </div>
      <p class="text-sm font-semibold">{{ langStore.t.adminNoBanners }}</p>
      <p class="text-xs text-center max-w-xs">{{ langStore.t.adminNoBannersHint }}</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-3">
      <div v-for="b in banners" :key="b.id"
        class="rounded-3xl border border-brand-border overflow-hidden hover:border-[#a78bfa]/20 transition-all group"
        style="background:#1F223C">
        <div class="flex items-center gap-4 p-4">
          <!-- Thumbnail -->
          <div class="w-24 h-16 rounded-2xl overflow-hidden flex-shrink-0 border border-white/[0.08] relative">
            <img v-if="b.image_url" :src="b.image_url" class="absolute inset-0 w-full h-full object-cover" />
            <div class="absolute inset-0"
              :style="b.gradient ? `background:${b.gradient};opacity:0.7` : 'background:#1a1a2e'" />
            <div class="absolute inset-0 p-1.5 flex flex-col justify-end">
              <p class="text-white text-[9px] font-extrabold leading-tight drop-shadow line-clamp-2">{{ b.title }}</p>
            </div>
          </div>
          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-extrabold text-sm text-white">{{ b.title }}</span>
              <span v-if="b.tag_label"
                class="text-[10px] font-bold px-1.5 py-0.5 rounded-full border"
                style="background:rgba(139,92,246,0.15);border-color:rgba(139,92,246,0.25);color:#a78bfa">
                {{ b.tag_label }}
              </span>
              <span :class="b.is_active ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-white/25 bg-white/5 border-white/10'"
                class="text-[10px] font-bold px-1.5 py-0.5 rounded-full border">
                {{ b.is_active ? `● ${langStore.t.activeLabel}` : `○ ${langStore.t.adminHiddenLabel}` }}
              </span>
            </div>
            <p v-if="b.subtitle" class="text-xs text-white/35 truncate">{{ b.subtitle }}</p>
            <p class="text-[10px] text-white/20 mt-0.5">{{ langStore.t.adminSortOrderLabel }} {{ b.sort_order }}{{ b.price_label ? ` · ${b.price_label}` : '' }}</p>
          </div>
          <!-- Actions -->
          <div class="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button @click="toggleBannerActive(b)"
              class="w-8 h-8 rounded-xl border flex items-center justify-center transition-all"
              :class="b.is_active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-white/5 border-white/[0.08] text-white/35 hover:text-white'">
              <BIcon :name="b.is_active ? 'Eye' : 'EyeOff'" class="w-3.5 h-3.5" />
            </button>
            <button @click="openBannerEdit(b)"
              class="w-8 h-8 rounded-xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white hover:border-[#a78bfa]/30 flex items-center justify-center transition-all">
              <BIcon name="Pencil" class="w-3.5 h-3.5" />
            </button>
            <button @click="deleteBanner(b.id)"
              class="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-all">
              <BIcon name="Trash2" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="banners.length >= 7"
      class="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl border"
      style="background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.2)">
      <BIcon name="AlertTriangle" class="w-4 h-4 text-amber-400 flex-shrink-0" />
      <p class="text-xs font-semibold text-amber-400">{{ langStore.t.adminBannerLimitReachedFull }}</p>
    </div>
    </template>
  </div>
</template>

<style scoped src="./admin-shared.css"></style>
