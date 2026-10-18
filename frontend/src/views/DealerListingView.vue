<script setup lang="ts">
import { errorMessage } from '@/lib/apiError'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import * as fmt from '@/lib/format'
const langStore = useLangStore()
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDealersDenStore, type DealerListingComment, type DenReview, REVIEW_TAGS } from '@/stores/dealersDen'
import { useConfirm } from '@/composables/useConfirm'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { listingShop } from '@/lib/dealerShop'
import AppHeader          from '@/components/AppHeader.vue'
import AppSidebar         from '@/components/AppSidebar.vue'
import BIcon              from '@/components/BIcon.vue'
import DenTrustBadge      from '@/components/DenTrustBadge.vue'
import DenWishlistButton  from '@/components/DenWishlistButton.vue'
import CommissionOrderPanel from '@/components/CommissionOrderPanel.vue'
import CommissionInfoBlocks from '@/components/CommissionInfoBlocks.vue'
import CommissionReviews   from '@/components/CommissionReviews.vue'
import ListingPanelHead    from '@/components/ListingPanelHead.vue'
import ListingSpecs        from '@/components/ListingSpecs.vue'
import DenReviewCard      from '@/components/DenReviewCard.vue'
import FrameEditor        from '@/components/FrameEditor.vue'
import api from '@/api'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const store  = useDealersDenStore()
const { confirmDialog } = useConfirm()
const { nsfwEnabled } = useNsfwMode()

const listing    = computed(() => store.currentListing)
const shop = computed(() => listingShop(listing.value!))
const activeImage = ref(0)
const isCommission = computed(() => listing.value?.listing_kind === 'commission_queue')
const nsfwRevealed = ref(false)
const reviewAvg = computed(() => reviews.value.length ? reviews.value.reduce((s, r) => s + r.rating, 0) / reviews.value.length : 0)
const sellerStats = computed(() => {
  const t = listing.value?.seller.den_trust_score
  const h = listing.value?.seller.avg_response_hours
  return [
    reviews.value.length ? { v: reviewAvg.value.toFixed(1), l: 'рейтинг' } : null,
    t?.completed_deals ? { v: String(t.completed_deals), l: 'заказов сдано' } : null,
    h != null ? { v: h < 1 ? '<1ч' : `~${Math.round(h)}ч`, l: 'время ответа' } : null,
  ].filter((x): x is { v: string; l: string } => !!x)
})

// ── Countdown ────────────────────────────────────────────────────────────────
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  try {
    await store.loadListing(route.params.id as string)
    activeImage.value = 0
    await Promise.all([loadBids(), loadComments(), loadReviews()])
    if (listing.value) {
      isWishlisted.value  = listing.value.is_wishlisted ?? false
      wishlistCount.value = listing.value.wishlist_count ?? 0
      if (listing.value.category === 'avatar_frame') await loadOwnedFrames()
    }
  } catch (err) {
    console.error('[DealerListingView] load error:', errorMessage(err))
  }
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => { if (ticker) clearInterval(ticker) })

function formatCountdown(iso: string | null | undefined) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - now.value
  if (diff <= 0) return langStore.t.dealerListingCountdownEnded
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000)  / 60000)
  const s = Math.floor((diff % 60000)    / 1000)
  if (d > 0) return `${d}${langStore.t.dealerListingDayShort} ${h}${langStore.t.dealerListingHourShort}`
  if (h > 0) return `${h}${langStore.t.dealerListingHourShort} ${m}${langStore.t.dealerListingMinuteShort}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function isHot(iso: string | null | undefined) {
  if (!iso) return false
  return new Date(iso).getTime() - now.value < 7200000
}

const formatPrice = fmt.formatPrice

const formatDate = (iso: string) => fmt.formatDate(iso, 'long', LANG_TO_LOCALE[langStore.currentLang])

const formatTime = (iso: string) => fmt.formatClock(iso, LANG_TO_LOCALE[langStore.currentLang])

function isSoldOut(l: any) {
  return l.status === 'sold' || (l.quantity > 0 && l.quantity_sold >= l.quantity)
}

// ── Bids ─────────────────────────────────────────────────────────────────────
const bids        = ref<any[]>([])
const showBidForm = ref(false)
const bidAmount   = ref(0)
const bidMessage  = ref('')
const isBidding   = ref(false)
const bidError    = ref('')

async function loadBids() {
  if (!listing.value) return
  if (listing.value.listing_kind !== 'auction' && listing.value.listing_kind !== 'ych') return
  bids.value = await store.getBids(listing.value.id)
}

function openBidForm() {
  if (!auth.user) { router.push({ name: 'login' }); return }
  const cur = parseFloat(String(listing.value?.current_bid ?? listing.value?.price ?? 0))
  const inc = parseFloat(String(listing.value?.bid_increment ?? 1))
  bidAmount.value = parseFloat((cur + inc).toFixed(2))
  bidMessage.value = ''
  bidError.value = ''
  showBidForm.value = true
}

async function submitBid() {
  if (!listing.value) return
  isBidding.value = true
  bidError.value = ''
  try {
    await store.placeBid(listing.value.id, bidAmount.value, bidMessage.value || undefined)
    await loadBids()
    showBidForm.value = false
  } catch (e: any) {
    bidError.value = e?.response?.data?.error ?? langStore.t.dealerListingGenericError
  } finally {
    isBidding.value = false
  }
}

// ── Raffle ───────────────────────────────────────────────────────────────────
const isBuyingTicket = ref(false)
const ticketSuccess  = ref(false)
const ticketError    = ref('')

const isDrawing = ref(false)
// Seller-only: picks the winner from the sold tickets right away.
async function drawWinner() {
  if (!listing.value) return
  if (!(await confirmDialog(langStore.t.dealerListingDrawConfirm))) return
  isDrawing.value = true
  ticketError.value = ''
  try {
    await store.drawRaffle(listing.value.id)
  } catch (e: any) {
    ticketError.value = e?.response?.data?.error ?? langStore.t.dealerListingGenericError
  } finally {
    isDrawing.value = false
  }
}

async function buyTicket() {
  if (!auth.user) { router.push({ name: 'login' }); return }
  if (!listing.value) return
  isBuyingTicket.value = true
  ticketError.value = ''
  try {
    await store.buyRaffleTicket(listing.value.id)
    ticketSuccess.value = true
  } catch (e: any) {
    ticketError.value = e?.response?.data?.error ?? langStore.t.dealerListingGenericError
  } finally {
    isBuyingTicket.value = false
  }
}

// ── Comments ─────────────────────────────────────────────────────────────────
const comments         = ref<DealerListingComment[]>([])
const commentBody      = ref('')
const replyTo          = ref<DealerListingComment | null>(null)
const replyBody        = ref('')
const isPostingComment = ref(false)

async function loadComments() {
  if (!listing.value) return
  comments.value = await store.getComments(listing.value.id)
}

async function postComment() {
  if (!commentBody.value.trim() || !listing.value) return
  isPostingComment.value = true
  try {
    const c = await store.addComment(listing.value.id, commentBody.value.trim())
    comments.value.unshift(c)
    commentBody.value = ''
  } catch {} finally {
    isPostingComment.value = false
  }
}

async function postReply(parent: DealerListingComment) {
  if (!replyBody.value.trim() || !listing.value) return
  const c = await store.addComment(listing.value.id, replyBody.value.trim(), parent.id)
  parent.replies = [...(parent.replies ?? []), c]
  replyTo.value  = null
  replyBody.value = ''
}

async function removeComment(comment: DealerListingComment) {
  await store.deleteComment(comment.id)
  comments.value = comments.value.filter(c => c.id !== comment.id)
}

// ── Meta ─────────────────────────────────────────────────────────────────────
const CAT_LABELS = computed<Record<string, string>>(() => ({
  art: langStore.t.dealerListingCatArt, fursuit: langStore.t.dealerListingCatFursuit, sticker: langStore.t.dealerListingCatSticker, badge: langStore.t.dealerListingCatBadge,
  print: langStore.t.dealerListingCatPrint, music: langStore.t.dealerListingCatMusic, craft: 'Handmade', merch: langStore.t.dealerListingCatMerch, other: langStore.t.other,
}))
const TYPE_LABELS = computed<Record<string, string>>(() => ({
  digital: langStore.t.dealerListingTypeDigital, physical: langStore.t.dealerListingTypePhysical, both: langStore.t.dealerListingTypeBoth,
}))
const KIND_THEME = computed(() => ({
  fixed:            { from: '#3148FF', to: '#4C67CF',  accent: '#93b4ff',  icon: 'Tag',         label: langStore.t.dealerListingKindFixed },
  auction:          { from: '#9c5700', to: '#5c2e00',  accent: '#FFC01F',  icon: 'Hammer',      label: langStore.t.dealerListingKindAuction },
  ych:              { from: '#4c1280', to: '#26094a',  accent: '#CD83F5',  icon: 'Paintbrush',  label: 'YCH'        },
  raffle:           { from: '#054d20', to: '#022b12',  accent: '#66C770',  icon: 'Gift',        label: langStore.t.dealerListingKindRaffle },
  commission_queue: { from: '#3b1f7a', to: '#1e0f40',  accent: '#a78bfa',  icon: 'ListOrdered', label: langStore.t.dealerListingKindCommission },
}))

const kindTheme = computed(() => KIND_THEME.value[(listing.value?.listing_kind ?? 'fixed') as keyof typeof KIND_THEME.value] ?? KIND_THEME.value.fixed)

// ── Wishlist ──────────────────────────────────────────────────────────────────
const isWishlisted  = ref(false)
const wishlistCount = ref(0)

// ── Reviews ───────────────────────────────────────────────────────────────────
const reviews         = ref<DenReview[]>([])
const showReviewForm  = ref(false)
const reviewRating    = ref(5)
const reviewTags      = ref<string[]>([])
const reviewText      = ref('')
const isPostingReview = ref(false)
const reviewError     = ref('')

function toggleReviewTag(tag: string) {
  const idx = reviewTags.value.indexOf(tag)
  if (idx === -1) reviewTags.value.push(tag)
  else reviewTags.value.splice(idx, 1)
}

async function loadReviews() {
  if (!listing.value) return
  reviews.value = await store.getListingReviews(listing.value.id)
}

async function submitReview() {
  if (!listing.value || reviewRating.value < 1) return
  isPostingReview.value = true
  reviewError.value = ''
  try {
    const r = await store.createReview(listing.value.id, {
      rating: reviewRating.value,
      tags: reviewTags.value,
      text: reviewText.value.trim() || undefined,
    })
    reviews.value.unshift(r)
    showReviewForm.value = false
    reviewText.value = ''
    reviewTags.value = []
    reviewRating.value = 5
  } catch (e: any) {
    reviewError.value = e?.response?.data?.error ?? langStore.t.dealerListingGenericError
  } finally {
    isPostingReview.value = false
  }
}

const canLeaveReview = computed(() =>
  auth.user &&
  listing.value?.status === 'sold' &&
  auth.user.id !== listing.value?.seller_id &&
  !reviews.value.some(r => r.reviewer_id === auth.user!.id)
)

function contactSeller() {
  if (!listing.value) return
  router.push({ name: 'messages', query: { userId: listing.value.seller.id } })
}

function goToTag(tag: string) {
  router.push({ name: 'dealers-den', query: { search: tag } })
}

// ── Avatar frame claim (free, instant — no in-app purchase flow exists yet) ──
const ownedFrameIds = ref<Set<string>>(new Set())
const isClaimingFrame = ref(false)
const claimFrameError = ref('')

const isAvatarFrame = computed(() => listing.value?.category === 'avatar_frame')
const frameOwned = computed(() => !!listing.value?.avatarFrame && ownedFrameIds.value.has(listing.value.avatarFrame.id))
const frameCalibration = computed(() => {
  const f = listing.value?.avatarFrame
  return f ? { offsetX: f.default_offset_x, offsetY: f.default_offset_y, scale: f.default_scale, rotation: f.default_rotation } : { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 }
})

async function loadOwnedFrames() {
  if (!auth.user) return
  try {
    const mine = await store.getMyAvatarFrames()
    ownedFrameIds.value = new Set(mine.map(f => f.id))
  } catch { /* non-critical */ }
}

async function claimFrame() {
  if (!listing.value?.avatarFrame || isClaimingFrame.value) return
  isClaimingFrame.value = true
  claimFrameError.value = ''
  try {
    await store.claimAvatarFrame(listing.value.avatarFrame.id)
    ownedFrameIds.value.add(listing.value.avatarFrame.id)
  } catch (err: any) {
    claimFrameError.value = err?.response?.data?.error ?? langStore.t.avatarFrameSubmitFailed
  } finally {
    isClaimingFrame.value = false
  }
}

// ── Edit ─────────────────────────────────────────────────────────────────────
const showEditModal = ref(false)
const isUpdating    = ref(false)
const editForm = ref({
  title: '', description: '', price: 0, currency: 'USD',
  quantity: 1, status: 'active' as 'active'|'draft'|'archived'|'sold',
  images: [] as string[], tags: '', isNsfw: false,
})

function openEdit() {
  if (!listing.value) return
  editForm.value = {
    title:       listing.value.title,
    description: listing.value.description ?? '',
    price:       parseFloat(String(listing.value.price)),
    currency:    listing.value.currency,
    quantity:    listing.value.quantity,
    status:      listing.value.status as any,
    images:      [...listing.value.images],
    tags:        listing.value.tags.join(', '),
    isNsfw:      listing.value.is_nsfw,
  }
  showEditModal.value = true
}

async function submitEdit() {
  if (!listing.value || !editForm.value.title.trim()) return
  isUpdating.value = true
  try {
    await store.updateListing(listing.value.id, {
      title:       editForm.value.title,
      description: editForm.value.description || undefined,
      price:       editForm.value.price,
      currency:    editForm.value.currency,
      quantity:    editForm.value.quantity,
      status:      editForm.value.status as any,
      images:      editForm.value.images,
      tags:        editForm.value.tags.split(',').map(t => t.trim()).filter(Boolean),
      isNsfw:      editForm.value.isNsfw,
    })
    await store.loadListing(listing.value.id)
    showEditModal.value = false
  } catch {} finally {
    isUpdating.value = false
  }
}

async function deleteListing() {
  if (!listing.value) return
  if (!(await confirmDialog(langStore.t.dealerListingDeleteConfirm, { danger: true }))) return
  await store.deleteListing(listing.value.id)
  router.push({ name: 'dealers-den' })
}

function addImageUrl() {
  editForm.value.images.push('')
}
function removeImage(i: number) {
  editForm.value.images.splice(i, 1)
}

// ── Share ─────────────────────────────────────────────────────────────────────
const shareToast = ref(false)
let shareTimer: ReturnType<typeof setTimeout> | null = null

function shareListing() {
  const url = window.location.href
  if (navigator.share) {
    navigator.share({ title: listing.value?.title ?? '', url })
  } else {
    navigator.clipboard.writeText(url).then(() => {
      shareToast.value = true
      if (shareTimer) clearTimeout(shareTimer)
      shareTimer = setTimeout(() => { shareToast.value = false }, 2500)
    })
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
const showReportModal  = ref(false)
const reportReason     = ref('')
const reportCustom     = ref('')
const isReporting      = ref(false)
const reportSuccess    = ref(false)

const REPORT_REASONS = computed(() => [
  langStore.t.dealerListingReportFraud,
  langStore.t.dealerListingReportSpam,
  langStore.t.dealerListingReportWrongCategory,
  langStore.t.dealerListingReportForbiddenContent,
  langStore.t.dealerListingReportCopyright,
  langStore.t.other,
])

async function submitReport() {
  if (!listing.value || !reportReason.value) return
  const reason = reportReason.value === langStore.t.other && reportCustom.value.trim()
    ? reportCustom.value.trim()
    : reportReason.value
  isReporting.value = true
  try {
    await api.post('/admin/reports', {
      targetType: 'listing',
      targetId:   listing.value.id,
      reason,
    })
    reportSuccess.value = true
    setTimeout(() => {
      showReportModal.value  = false
      reportSuccess.value    = false
      reportReason.value     = ''
      reportCustom.value     = ''
    }, 2000)
  } catch {} finally {
    isReporting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20 stack-y-4">

        <!-- Back -->
        <button @click="router.push({ name: 'dealers-den' })"
          class="flex items-center gap-2 text-white/40 hover:text-white text-sm font-semibold transition-colors">
          <BIcon name="ArrowLeft" class="w-4 h-4" /> Dealers&apos; Den
        </button>

        <!-- Loading skeleton -->
        <div v-if="store.isLoading" class="stack-y-4">
          <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden animate-pulse">
            <div class="w-full h-80 bg-brand-border" />
            <div class="p-6 stack-y-4">
              <div class="h-7 bg-brand-border rounded-full w-2/3" />
              <div class="h-4 bg-brand-border rounded-full w-full" />
              <div class="h-4 bg-brand-border rounded-full w-3/4" />
            </div>
          </div>
        </div>

        <!-- 404 -->
        <div v-else-if="!listing"
          class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl">
          <BIcon name="PackageX" class="w-14 h-14 text-white/20 mx-auto mb-4" />
          <h2 class="text-2xl font-bold text-white mb-2">{{ langStore.t.dealerListingNotFoundTitle }}</h2>
          <p class="text-white/35 text-sm mb-6">{{ langStore.t.dealerListingNotFoundDesc }}</p>
          <button @click="router.push({ name: 'dealers-den' })"
            class="inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-2xl"
            style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
            <BIcon name="ShoppingBag" class="w-4 h-4" /> {{ langStore.t.dealerListingBackToDen }}
          </button>
        </div>

        <template v-else>

          <!-- ═══ ACTION BAR ══════════════════════════════════════════════ -->
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Share toast -->
            <Transition name="fade-up">
              <div v-if="shareToast"
                class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-brand-success text-white text-sm font-bold px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 pointer-events-none">
                <BIcon name="Check" class="w-4 h-4" /> {{ langStore.t.dealerListingLinkCopied }}
              </div>
            </Transition>

            <!-- Owner buttons -->
            <template v-if="auth.user?.id === listing.seller_id">
              <button @click="openEdit"
                class="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-2xl transition-all hover:opacity-90 shadow-xs"
                style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                <BIcon name="Pencil" class="w-3.5 h-3.5" /> {{ langStore.t.editPost }}
              </button>
              <button @click="deleteListing"
                class="flex items-center gap-2 px-4 py-2 text-sm font-bold text-brand-error/80 bg-brand-error/10 border border-brand-error/20 rounded-2xl transition-all hover:bg-brand-error/20 hover:text-brand-error">
                <BIcon name="Trash2" class="w-3.5 h-3.5" /> {{ langStore.t.deleteBtn }}
              </button>
            </template>
            <!-- Non-owner: report -->
            <button v-else-if="auth.user" @click="showReportModal = true"
              class="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white/40 bg-brand-card border border-brand-border rounded-2xl transition-all hover:text-brand-error hover:border-brand-error/30">
              <BIcon name="Flag" class="w-3.5 h-3.5" /> {{ langStore.t.report }}
            </button>

            <!-- Share (always) -->
            <button @click="shareListing"
              class="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white/40 bg-brand-card border border-brand-border rounded-2xl transition-all hover:text-white hover:border-white/20 ml-auto">
              <BIcon name="Share2" class="w-3.5 h-3.5" /> {{ langStore.t.share }}
            </button>
          </div>

          <!-- ═══ MAIN LAYOUT ═══════════════════════════════════════════════ -->
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">

            <!-- Gallery (3/5) -->
            <div class="lg:col-span-3 stack-y-3">
              <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                <!-- Main image -->
                <div class="relative w-full" style="aspect-ratio: 4/3; background: #090d20">
                  <img v-if="listing.images[activeImage]" :src="listing.images[activeImage]" :alt="listing.title"
                    class="w-full h-full object-contain" />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <BIcon name="Image" class="w-20 h-20 text-brand-border" />
                  </div>
                  <div v-if="isSoldOut(listing)" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span class="bg-brand-error text-white font-extrabold text-2xl px-8 py-3 rounded-full tracking-wide">{{ langStore.t.dealerListingSoldOutBadge }}</span>
                  </div>
                  <div v-else-if="listing.is_nsfw && !nsfwEnabled && !nsfwRevealed" class="absolute inset-0 backdrop-blur-2xl bg-black/50 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <span class="w-14 h-14 rounded-full bg-brand-error/15 border border-brand-error/30 flex items-center justify-center">
                      <BIcon name="EyeOff" class="w-7 h-7 text-brand-error" />
                    </span>
                    <span class="text-white font-extrabold text-lg">{{ langStore.t.dealerListingNsfwContent }}</span>
                    <span class="text-white/50 text-xs">В примерах есть работы для взрослых</span>
                    <button type="button" @click="nsfwRevealed = true"
                      class="mt-1 flex items-center gap-2 px-5 py-2 rounded-xl bg-white/8 border border-white/15 text-white text-sm font-bold hover:bg-white/15 transition-colors">
                      <BIcon name="Eye" class="w-4 h-4" /> Показать
                    </button>
                  </div>
                  <div v-if="listing.images.length > 1"
                    class="absolute bottom-3 right-3 bg-black/60 backdrop-blur-xs text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    {{ activeImage + 1 }}/{{ listing.images.length }}
                  </div>
                </div>
                <!-- Thumbnails -->
                <div v-if="listing.images.length > 1" class="flex gap-2 p-3 bg-black/20 overflow-x-auto scrollbar-none">
                  <button v-for="(img, i) in listing.images" :key="i" @click="activeImage = i"
                    class="w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all"
                    :class="activeImage === i ? 'border-brand-accent' : 'border-transparent opacity-55 hover:opacity-90'">
                    <img :src="img" class="w-full h-full object-cover" />
                  </button>
                </div>
              </div>

              <!-- Description -->
              <CommissionInfoBlocks v-if="isCommission" :listing="listing" @tag="goToTag" />
              <ListingSpecs v-if="!isCommission" :listing="listing" />
              <div v-if="listing.description && !isCommission"
                class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl">
                <h3 class="text-xs font-bold text-white/35 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <BIcon name="AlignLeft" class="w-3.5 h-3.5" /> {{ langStore.t.fursuitDescLabel }}
                </h3>
                <p class="text-sm text-white/75 leading-relaxed whitespace-pre-line">{{ listing.description }}</p>
              </div>

              <!-- Tags -->
              <div v-if="listing.tags.length && !isCommission" class="flex flex-wrap gap-2">
                <button v-for="tag in listing.tags" :key="tag" type="button" @click="goToTag(tag)"
                  class="text-xs text-brand-accent bg-brand-accent/8 hover:bg-brand-accent/15 border border-brand-accent/20 px-3 py-1 rounded-full transition-colors">
                  #{{ tag }}
                </button>
              </div>

              <!-- Meta -->
              <!-- Seller (группа, привязанная к Dealers Den; у старых лотов — автор) -->
              <div class="relative overflow-hidden bg-brand-card border border-brand-border rounded-2xl shadow-lg">
                <div class="absolute inset-0 pointer-events-none opacity-60"
                  style="background: radial-gradient(120% 140% at 0% 0%, rgba(49,72,255,0.14), transparent 60%)" />
                <div class="relative flex items-center justify-between gap-4 flex-wrap p-4">
                  <RouterLink :to="shop.to" class="group flex items-center gap-3.5 min-w-0">
                    <img v-if="shop.avatar" :src="shop.avatar"
                      class="w-14 h-14 shrink-0 object-cover border-2 border-brand-border group-hover:border-brand-accent transition-colors"
                      :class="shop.isGroup ? 'rounded-2xl' : 'rounded-full'" />
                    <div v-else class="w-14 h-14 shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xl font-extrabold border-2 border-brand-border group-hover:border-brand-accent transition-colors"
                      :class="shop.isGroup ? 'rounded-2xl' : 'rounded-full'">
                      {{ shop.name[0].toUpperCase() }}
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="font-extrabold text-white text-base truncate group-hover:text-brand-accent transition-colors">{{ shop.name }}</span>
                        <BIcon v-if="shop.verified" name="BadgeCheck" class="w-4 h-4 text-brand-accent shrink-0" :title="langStore.t.verBadgeGenericLabel" />
                        <BIcon name="ChevronRight" class="w-4 h-4 text-white/30 shrink-0 group-hover:translate-x-0.5 group-hover:text-brand-accent transition-all" />
                      </div>
                      <p v-if="listing.group" class="text-xs text-white/35 truncate">@{{ listing.group.slug }}</p>
                      <p v-else class="text-xs text-white/35 truncate">@{{ listing.seller.username }}</p>
                      <DenTrustBadge v-if="listing.seller.den_trust_score" :trust="listing.seller.den_trust_score" class="mt-1" />
                    </div>
                  </RouterLink>
                  <div class="flex items-center gap-2">
                    <DenWishlistButton
                      :listingId="listing.id"
                      :initialWishlisted="isWishlisted"
                      :count="wishlistCount"
                      @change="v => { isWishlisted = v; wishlistCount += v ? 1 : -1 }"
                    />
                    <button v-if="auth.user && auth.user.id !== listing.seller_id"
                      @click="contactSeller"
                      class="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:opacity-90"
                      style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                      <BIcon name="MessageCircle" class="w-4 h-4" /> {{ langStore.t.msgBtnTitle }}
                    </button>
                  </div>
                </div>
                <div v-if="isCommission && sellerStats.length" class="relative grid gap-2 px-4 pb-4" :style="`grid-template-columns: repeat(${sellerStats.length}, minmax(0, 1fr))`">
                  <div v-for="st in sellerStats" :key="st.l" class="rounded-xl bg-black/25 px-3 py-2.5">
                    <p class="text-lg font-black text-white leading-none tabular-nums">{{ st.v }}</p>
                    <p class="text-[10px] text-white/35 mt-1">{{ st.l }}</p>
                  </div>
                </div>
              </div>

              <CommissionReviews v-if="isCommission" :reviews="reviews">
                <template #action>
                  <button v-if="canLeaveReview" @click="showReviewForm = !showReviewForm"
                    class="text-xs px-3 py-1.5 rounded-lg font-bold text-white"
                    :style="`background: linear-gradient(135deg, ${kindTheme.from}, ${kindTheme.to})`">
                    {{ showReviewForm ? langStore.t.cancel : langStore.t.dealerListingLeaveReviewBtn }}
                  </button>
                </template>
                <template #form>
                  <div v-if="showReviewForm" class="stack-y-4">
                    <div class="flex items-center gap-1">
                      <button v-for="s in 5" :key="s" @click="reviewRating = s" class="text-2xl transition-transform hover:scale-110">
                        <span :class="s <= reviewRating ? 'text-brand-yellow' : 'text-white/20'">★</span>
                      </button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button v-for="tag in REVIEW_TAGS" :key="tag" @click="toggleReviewTag(tag)"
                        class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                        :class="reviewTags.includes(tag) ? 'border-brand-accent bg-brand-accent/20 text-brand-accent' : 'border-white/10 text-white/40 hover:border-white/20'">{{ tag }}</button>
                    </div>
                    <textarea v-model="reviewText" rows="3" :placeholder="langStore.t.dealerListingReviewPlaceholder"
                      class="w-full bg-[#0a0a1a] border border-white/8 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-white/20 resize-none" />
                    <div v-if="reviewError" class="text-xs text-brand-error">{{ reviewError }}</div>
                    <button @click="submitReview" :disabled="isPostingReview"
                      class="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-30"
                      :style="`background: linear-gradient(135deg, ${kindTheme.from}, ${kindTheme.to})`">
                      <BIcon name="Send" class="w-3.5 h-3.5" /> {{ isPostingReview ? langStore.t.helpSubmitting : langStore.t.publish }}
                    </button>
                  </div>
                </template>
              </CommissionReviews>
            </div>

            <!-- ═══ Right panel (2/5) ══════════════════════════════════════ -->
            <div class="lg:col-span-2 stack-y-4">

              <!-- ── AUCTION ──────────────────────────────────────────────── -->
              <template v-if="listing.listing_kind === 'auction'">
                <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                  <div class="p-5 stack-y-4">
                    <ListingPanelHead :listing="listing" :theme="kindTheme" :wishlist-count="wishlistCount" />
                    <div class="flex items-end justify-between">
                      <div>
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-1">{{ langStore.t.dealerListingCurrentBid }}</p>
                        <p class="text-3xl font-black text-brand-yellow tabular-nums leading-none">
                          {{ formatPrice(listing.current_bid ?? listing.price, listing.currency) }}
                        </p>
                        <p class="text-xs text-white/30 mt-1">
                          {{ listing.bid_count }} {{ listing.bid_count === 1 ? langStore.t.dealerListingBidWordOne : listing.bid_count < 5 ? langStore.t.dealerListingBidWordFew : langStore.t.dealerListingBidWordMany }}
                          · {{ langStore.t.dealerListingStartPrice }} {{ formatPrice(listing.price, listing.currency) }}
                        </p>
                      </div>
                      <div class="text-right rounded-2xl border border-brand-error/30 bg-brand-error/10 px-4 py-2.5">
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-1">{{ langStore.t.dealerListingTimeLeft }}</p>
                        <p class="text-2xl font-black tabular-nums leading-none"
                          :class="isHot(listing.auction_ends_at) ? 'text-brand-error' : 'text-white'">
                          {{ formatCountdown(listing.auction_ends_at) ?? '—' }}
                        </p>
                        <p v-if="listing.auction_ends_at" class="text-[9px] text-white/25 mt-1">
                          {{ langStore.t.dealerListingUntilPrefix }} {{ formatDate(listing.auction_ends_at) }}
                        </p>
                      </div>
                    </div>
                    <div v-if="listing.auto_buy_price"
                      class="flex items-center justify-between bg-brand-yellow/8 border border-brand-yellow/15 rounded-2xl px-4 py-2.5">
                      <div class="flex items-center gap-2">
                        <BIcon name="Zap" class="w-4 h-4 text-brand-yellow" />
                        <span class="text-xs font-bold text-white/70">{{ langStore.t.dealerListingAutoBuyLabel }}</span>
                      </div>
                      <span class="text-sm font-extrabold text-brand-yellow">{{ formatPrice(listing.auto_buy_price, listing.currency) }}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs text-white/30">
                      <span>{{ langStore.t.dealerListingBidStepLabel }}</span>
                      <span class="font-bold text-white/50">+{{ formatPrice(listing.bid_increment, listing.currency) }}</span>
                    </div>
                    <!-- Bid CTA -->
                    <div v-if="!isSoldOut(listing) && !showBidForm">
                      <button @click="openBidForm"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white font-extrabold rounded-2xl transition-all shadow-lg hover:opacity-90 active:scale-[0.98] text-sm"
                        style="background: linear-gradient(135deg, #FFC01F, #E76F51)">
                        <BIcon name="Hammer" class="w-4 h-4" /> {{ langStore.t.dealerListingPlaceBidBtn }}
                      </button>
                    </div>
                    <!-- Bid form -->
                    <div v-if="showBidForm && !isSoldOut(listing)" class="stack-y-3">
                      <div class="stack-y-1.5">
                        <label class="text-[9px] text-white/35 uppercase tracking-wider font-bold">{{ langStore.t.dealerListingYourBidLabel }}</label>
                        <div class="relative">
                          <input v-model.number="bidAmount" type="number" min="0" step="0.01"
                            class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 pr-14 text-white text-sm outline-hidden focus:border-brand-yellow/40 transition-all" />
                          <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/25 font-bold">{{ listing.currency }}</span>
                        </div>
                      </div>
                      <div class="grid grid-cols-3 gap-2">
                        <button v-for="k in [1, 2, 5]" :key="k" type="button" @click="bidAmount = parseFloat((bidAmount + k * parseFloat(String(listing.bid_increment ?? 1))).toFixed(2))"
                          class="py-2 rounded-xl bg-white/4 border border-brand-border text-xs font-bold text-white/70 hover:border-white/25 transition-colors">
                          +{{ formatPrice(k * parseFloat(String(listing.bid_increment ?? 1)), listing.currency) }}
                        </button>
                      </div>
                      <p class="text-[11px] text-white/35">Минимальная ставка {{ formatPrice(parseFloat(String(listing.current_bid ?? listing.price)) + parseFloat(String(listing.bid_increment ?? 1)), listing.currency) }} · шаг {{ formatPrice(listing.bid_increment, listing.currency) }}</p>
                      <div class="stack-y-1.5">
                        <label class="text-[9px] text-white/35 uppercase tracking-wider font-bold">{{ langStore.t.dealerListingMessageOptionalLabel }}</label>
                        <textarea v-model="bidMessage" rows="2" :placeholder="langStore.t.dealerListingBidMessagePlaceholder"
                          class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm resize-none outline-hidden focus:border-brand-yellow/40 transition-all" />
                      </div>
                      <div v-if="bidError" class="text-brand-error text-xs bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ bidError }}</div>
                      <div class="flex gap-2">
                        <button @click="showBidForm = false"
                          class="px-4 py-2.5 border border-white/10 text-white/40 text-sm font-bold rounded-2xl hover:bg-white/5 transition-all">{{ langStore.t.cancel }}</button>
                        <button @click="submitBid" :disabled="isBidding || bidAmount <= 0"
                          class="flex-1 flex items-center justify-center gap-2 py-2.5 disabled:opacity-30 text-white text-sm font-extrabold rounded-2xl transition-all hover:opacity-90"
                          style="background: linear-gradient(135deg, #FFC01F, #E76F51)">
                          <span v-if="isBidding" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <BIcon v-else name="Hammer" class="w-4 h-4" />
                          {{ isBidding ? langStore.t.helpSubmitting : langStore.t.dealerListingConfirmBidBtn }}
                        </button>
                      </div>
                    </div>
                    <div v-if="isSoldOut(listing)"
                      class="flex items-center gap-2 bg-brand-success/10 border border-brand-success/20 rounded-2xl px-4 py-3">
                      <BIcon name="Trophy" class="w-5 h-5 text-brand-success shrink-0" />
                      <div>
                        <p class="text-xs font-bold text-brand-success">{{ langStore.t.dealerListingAuctionEnded }}</p>
                        <p class="text-[10px] text-white/35 mt-0.5">{{ langStore.t.dealerListingFinalPriceLabel }} {{ formatPrice(listing.current_bid ?? listing.price, listing.currency) }}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Auction bid history -->
                <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                  <div class="px-5 py-3.5 border-b border-brand-border flex items-center justify-between">
                    <h3 class="text-xs font-extrabold text-white/50 uppercase tracking-widest flex items-center gap-2">
                      <BIcon name="History" class="w-3.5 h-3.5 text-brand-yellow" /> {{ langStore.t.dealerListingBidHistoryTitle }}
                    </h3>
                    <span class="text-xs text-white/30 font-medium">{{ bids.length }}</span>
                  </div>
                  <div class="divide-y divide-brand-border max-h-72 overflow-y-auto">
                    <div v-if="bids.length === 0" class="py-8 text-center text-white/25 text-sm">{{ langStore.t.dealerListingNoBidsYet }}</div>
                    <div v-for="(bid, i) in bids" :key="bid.id"
                      class="px-5 py-3 flex items-center gap-3"
                      :class="i === 0 ? 'bg-brand-yellow/5' : 'hover:bg-white/2'">
                      <div class="relative">
                        <img v-if="bid.bidder.avatar_url" :src="bid.bidder.avatar_url"
                          class="w-8 h-8 rounded-full object-cover border border-brand-border shrink-0" />
                        <div v-else class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-extrabold border border-brand-border">
                          {{ (bid.bidder.display_name ?? bid.bidder.username)[0].toUpperCase() }}
                        </div>
                        <BIcon v-if="i === 0" name="Crown" class="w-3 h-3 text-brand-yellow absolute -top-1 -right-1" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold text-white truncate">
                          {{ bid.bidder.display_name ?? bid.bidder.username }}
                          <span v-if="i === 0" class="text-brand-yellow ml-1 text-[9px]">● {{ langStore.t.dealerListingLeaderLabel }}</span>
                        </p>
                        <p v-if="bid.message" class="text-[10px] text-white/30 truncate mt-0.5">{{ bid.message }}</p>
                        <p class="text-[9px] text-white/25 mt-0.5">{{ formatDate(bid.created_at) }}, {{ formatTime(bid.created_at) }}</p>
                      </div>
                      <span class="text-sm font-extrabold shrink-0"
                        :class="i === 0 ? 'text-brand-yellow' : 'text-white/60'">
                        {{ formatPrice(bid.amount, listing.currency) }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- ── YCH ─────────────────────────────────────────────────── -->
              <template v-else-if="listing.listing_kind === 'ych'">
                <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                  <div class="p-5 stack-y-4">
                    <ListingPanelHead :listing="listing" :theme="kindTheme" :wishlist-count="wishlistCount" />
                    <!-- Slot grid -->
                    <div>
                      <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-2">{{ langStore.t.dealerListingSlotsLabel }}</p>
                      <div class="flex flex-wrap gap-1.5">
                        <div v-for="s in (listing.quantity ?? 1)" :key="s"
                          class="relative flex items-center justify-center rounded-lg text-[9px] font-extrabold transition-all"
                          style="width: 32px; height: 32px"
                          :style="s <= (listing.quantity_sold ?? 0)
                            ? 'background: rgba(205,131,245,0.08); border: 1px solid rgba(205,131,245,0.12); color: rgba(255,255,255,0.2)'
                            : 'background: linear-gradient(135deg, rgba(205,131,245,0.3), rgba(124,58,237,0.3)); border: 1px solid rgba(205,131,245,0.4); box-shadow: 0 0 8px rgba(205,131,245,0.15); color: white'">
                          <BIcon v-if="s <= (listing.quantity_sold ?? 0)" name="X" class="w-3 h-3 text-white/20" />
                          <span v-else>{{ s }}</span>
                        </div>
                      </div>
                      <p class="text-[10px] text-white/35 mt-2">
                        <span class="text-brand-purple font-bold">{{ (listing.quantity ?? 1) - (listing.quantity_sold ?? 0) }}</span>
                        {{ langStore.t.dealerListingFreeOutOf }} {{ listing.quantity ?? 1 }}
                      </p>
                    </div>
                    <!-- Bid info -->
                    <div class="flex items-end justify-between">
                      <div>
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-1">{{ langStore.t.dealerListingCurrentBid }}</p>
                        <p class="text-3xl font-black text-brand-purple leading-none tabular-nums">
                          {{ formatPrice(listing.current_bid ?? listing.price, listing.currency) }}
                        </p>
                        <p class="text-xs text-white/30 mt-1">
                          {{ listing.bid_count }} {{ listing.bid_count === 1 ? langStore.t.dealerListingBidWordOne : listing.bid_count < 5 ? langStore.t.dealerListingBidWordFew : langStore.t.dealerListingBidWordMany }}
                        </p>
                      </div>
                      <div class="text-right rounded-2xl border border-brand-error/30 bg-brand-error/10 px-4 py-2.5">
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-1">{{ langStore.t.dealerListingUntilEndLabel }}</p>
                        <p class="text-xl font-black tabular-nums leading-none"
                          :class="isHot(listing.auction_ends_at) ? 'text-brand-error' : 'text-white/80'">
                          {{ formatCountdown(listing.auction_ends_at) ?? '—' }}
                        </p>
                      </div>
                    </div>
                    <div v-if="listing.auto_buy_price"
                      class="flex items-center justify-between bg-brand-yellow/8 border border-brand-yellow/15 rounded-2xl px-4 py-2.5">
                      <div class="flex items-center gap-2">
                        <BIcon name="Zap" class="w-4 h-4 text-brand-yellow" />
                        <span class="text-xs font-bold text-white/60">{{ langStore.t.dealerListingAutoBuySlotLabel }}</span>
                      </div>
                      <span class="text-sm font-extrabold text-brand-yellow">{{ formatPrice(listing.auto_buy_price, listing.currency) }}</span>
                    </div>
                    <!-- Bid CTA -->
                    <div v-if="!isSoldOut(listing) && !showBidForm">
                      <button @click="openBidForm"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white font-extrabold rounded-2xl transition-all shadow-lg hover:opacity-90 active:scale-[0.98] text-sm"
                        style="background: linear-gradient(135deg, #CD83F5, #7C3AED)">
                        <BIcon name="Paintbrush" class="w-4 h-4" /> {{ langStore.t.dealerListingTakeSlotBtn }}
                      </button>
                    </div>
                    <!-- YCH bid form -->
                    <div v-if="showBidForm && !isSoldOut(listing)" class="stack-y-3">
                      <div class="stack-y-1.5">
                        <label class="text-[9px] text-white/35 uppercase tracking-wider font-bold">{{ langStore.t.dealerListingYourSlotBidLabel }}</label>
                        <div class="relative">
                          <input v-model.number="bidAmount" type="number" min="0" step="0.01"
                            class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 pr-14 text-white text-sm outline-hidden focus:border-brand-purple/40 transition-all" />
                          <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/25 font-bold">{{ listing.currency }}</span>
                        </div>
                      </div>
                      <div class="grid grid-cols-3 gap-2">
                        <button v-for="k in [1, 2, 5]" :key="k" type="button" @click="bidAmount = parseFloat((bidAmount + k * parseFloat(String(listing.bid_increment ?? 1))).toFixed(2))"
                          class="py-2 rounded-xl bg-white/4 border border-brand-border text-xs font-bold text-white/70 hover:border-white/25 transition-colors">
                          +{{ formatPrice(k * parseFloat(String(listing.bid_increment ?? 1)), listing.currency) }}
                        </button>
                      </div>
                      <p class="text-[11px] text-white/35">Минимальная ставка {{ formatPrice(parseFloat(String(listing.current_bid ?? listing.price)) + parseFloat(String(listing.bid_increment ?? 1)), listing.currency) }} · шаг {{ formatPrice(listing.bid_increment, listing.currency) }}</p>
                      <div class="stack-y-1.5">
                        <label class="text-[9px] text-white/35 uppercase tracking-wider font-bold">{{ langStore.t.dealerListingCharDescLabel }}</label>
                        <textarea v-model="bidMessage" rows="3" :placeholder="langStore.t.dealerListingCharDescPlaceholder"
                          class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm resize-none outline-hidden focus:border-brand-purple/40 transition-all" />
                      </div>
                      <div v-if="bidError" class="text-brand-error text-xs bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ bidError }}</div>
                      <div class="flex gap-2">
                        <button @click="showBidForm = false"
                          class="px-4 py-2.5 border border-white/10 text-white/40 text-sm font-bold rounded-2xl hover:bg-white/5 transition-all">{{ langStore.t.cancel }}</button>
                        <button @click="submitBid" :disabled="isBidding || bidAmount <= 0"
                          class="flex-1 flex items-center justify-center gap-2 py-2.5 disabled:opacity-30 text-white text-sm font-extrabold rounded-2xl hover:opacity-90"
                          style="background: linear-gradient(135deg, #CD83F5, #7C3AED)">
                          <span v-if="isBidding" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <BIcon v-else name="Paintbrush" class="w-4 h-4" />
                          {{ isBidding ? langStore.t.helpSubmitting : langStore.t.confirmBtn }}
                        </button>
                      </div>
                    </div>
                    <div v-if="isSoldOut(listing)"
                      class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                      <BIcon name="CheckCircle2" class="w-5 h-5 text-brand-success" />
                      <p class="text-xs font-bold text-white/60">{{ langStore.t.dealerListingAllSlotsFull }}</p>
                    </div>
                  </div>
                </div>
                <!-- YCH bid history -->
                <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                  <div class="px-5 py-3.5 border-b border-brand-border flex items-center justify-between">
                    <h3 class="text-xs font-extrabold text-white/50 uppercase tracking-widest flex items-center gap-2">
                      <BIcon name="History" class="w-3.5 h-3.5 text-brand-purple" /> {{ langStore.t.dealerListingSlotBidsTitle }}
                    </h3>
                    <span class="text-xs text-white/30">{{ bids.length }}</span>
                  </div>
                  <div class="divide-y divide-brand-border max-h-64 overflow-y-auto">
                    <div v-if="bids.length === 0" class="py-8 text-center text-white/25 text-sm">{{ langStore.t.dealerListingNoBidsYet }}</div>
                    <div v-for="(bid, i) in bids" :key="bid.id" class="px-5 py-3 flex items-center gap-3">
                      <img v-if="bid.bidder.avatar_url" :src="bid.bidder.avatar_url"
                        class="w-8 h-8 rounded-full object-cover border border-brand-border shrink-0" />
                      <div v-else class="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center text-brand-purple text-xs font-extrabold shrink-0">
                        {{ (bid.bidder.display_name ?? bid.bidder.username)[0].toUpperCase() }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold text-white truncate">
                          {{ bid.bidder.display_name ?? bid.bidder.username }}
                          <span v-if="i === 0" class="text-brand-purple ml-1 text-[9px]">● {{ langStore.t.dealerListingLeaderLabel }}</span>
                        </p>
                        <p v-if="bid.message" class="text-[10px] text-white/25 truncate mt-0.5 italic">{{ bid.message }}</p>
                      </div>
                      <span class="text-sm font-extrabold shrink-0"
                        :class="i === 0 ? 'text-brand-purple' : 'text-white/50'">
                        {{ formatPrice(bid.amount, listing.currency) }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- ── RAFFLE ──────────────────────────────────────────────── -->
              <template v-else-if="listing.listing_kind === 'raffle'">
                <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                  <div class="p-5 stack-y-4">
                    <ListingPanelHead :listing="listing" :theme="kindTheme" :wishlist-count="wishlistCount" />
                    <!-- Progress -->
                    <div>
                      <div class="flex items-center justify-between mb-1.5">
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold">{{ langStore.t.dealerListingTicketsSoldLabel }}</p>
                        <p class="text-xs font-bold text-brand-success tabular-nums">
                          {{ listing.raffle_tickets_sold }}{{ listing.raffle_max_tickets ? ` / ${listing.raffle_max_tickets}` : '' }}
                          <span class="text-white/30 font-normal ml-1">
                            {{ listing.raffle_max_tickets
                              ? `(${Math.round((listing.raffle_tickets_sold / listing.raffle_max_tickets) * 100)}%)`
                              : langStore.t.dealerListingTicketsWord }}
                          </span>
                        </p>
                      </div>
                      <div class="w-full h-3 bg-black/30 rounded-full overflow-hidden mb-3">
                        <div class="h-full rounded-full transition-all duration-700"
                          style="background: linear-gradient(90deg, #66C770, #059669)"
                          :style="`width: ${listing.raffle_max_tickets
                            ? Math.min(100, (listing.raffle_tickets_sold / listing.raffle_max_tickets) * 100)
                            : Math.min(100, listing.raffle_tickets_sold * 5)}%`" />
                      </div>
                      <!-- Milestones -->
                      <div class="flex gap-1.5 items-center">
                        <template v-for="m in [25, 50, 75, 100]" :key="m">
                          <div class="flex-1 h-1 rounded-full transition-all"
                            :style="(listing.raffle_max_tickets
                              ? (listing.raffle_tickets_sold / listing.raffle_max_tickets) * 100
                              : listing.raffle_tickets_sold * 5) >= m
                              ? 'background: rgba(102,199,112,0.5)'
                              : 'background: rgba(255,255,255,0.06)'" />
                          <span class="text-[8px] text-white/20 shrink-0">{{ m }}%</span>
                        </template>
                      </div>
                    </div>
                    <!-- Ticket price -->
                    <div class="flex items-end justify-between">
                      <div>
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-1">{{ langStore.t.dealerListingTicketPriceLabel }}</p>
                        <p class="text-3xl font-black text-brand-success leading-none tabular-nums">
                          {{ parseFloat(String(listing.price)) === 0 ? langStore.t.dealerListingFreeCaps : formatPrice(listing.price, listing.currency) }}
                        </p>
                      </div>
                      <div v-if="listing.raffle_max_tickets" class="text-right">
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-1">{{ langStore.t.dealerListingTimeLeft }}</p>
                        <p class="text-2xl font-black text-white leading-none tabular-nums">
                          {{ listing.raffle_max_tickets - listing.raffle_tickets_sold }}
                        </p>
                        <p class="text-[9px] text-white/25 mt-0.5">{{ langStore.t.dealerListingTicketsWord }}</p>
                      </div>
                    </div>
                    <!-- Success state -->
                    <div v-if="ticketSuccess"
                      class="flex items-center gap-3 bg-brand-success/12 border border-brand-success/25 rounded-2xl px-4 py-3">
                      <BIcon name="Ticket" class="w-5 h-5 text-brand-success shrink-0" />
                      <div>
                        <p class="text-xs font-bold text-brand-success">{{ langStore.t.dealerListingTicketPurchased }}</p>
                        <p class="text-[10px] text-white/40 mt-0.5">{{ langStore.t.dealerListingWatchRaffleResults }}</p>
                      </div>
                    </div>
                    <!-- Seller: draw the winner (and see own ticket count as a buyer) -->
                    <div v-if="auth.user && listing.my_raffle_tickets" class="text-xs text-white/50">
                      {{ langStore.t.dealerListingMyTicketsLabel }}: <span class="font-bold text-brand-success">{{ listing.my_raffle_tickets }}</span>
                    </div>
                    <button v-if="auth.user?.id === listing.seller_id && !isSoldOut(listing) && listing.raffle_tickets_sold > 0"
                      @click="drawWinner" :disabled="isDrawing"
                      class="w-full flex items-center justify-center gap-2 py-3 text-white font-extrabold rounded-2xl transition-all hover:opacity-90 text-sm disabled:opacity-40 border border-brand-success/30 bg-brand-success/10">
                      <span v-if="isDrawing" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <BIcon v-else name="Trophy" class="w-4 h-4 text-brand-success" />
                      {{ langStore.t.dealerListingDrawBtn }}
                    </button>
                    <div v-if="ticketError && auth.user?.id === listing.seller_id" class="text-brand-error text-xs bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ ticketError }}</div>
                    <!-- Buy CTA (sellers can't buy into their own raffle) -->
                    <template v-if="!isSoldOut(listing) && !ticketSuccess && auth.user?.id !== listing.seller_id && !listing.my_raffle_tickets">
                      <button v-if="auth.user" @click="buyTicket" :disabled="isBuyingTicket"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white font-extrabold rounded-2xl transition-all shadow-lg hover:opacity-90 active:scale-[0.98] text-sm disabled:opacity-40"
                        style="background: linear-gradient(135deg, #66C770, #059669)">
                        <span v-if="isBuyingTicket" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <BIcon v-else name="Ticket" class="w-4 h-4" />
                        {{ isBuyingTicket ? langStore.t.dealerListingBuyingEllipsis : langStore.t.dealerListingBuyTicketBtn }}
                      </button>
                      <button v-else @click="router.push({ name: 'login' })"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white/60 font-bold rounded-2xl border border-brand-border hover:border-brand-success/40 hover:text-white transition-all text-sm">
                        <BIcon name="LogIn" class="w-4 h-4" /> {{ langStore.t.dealerListingLoginToParticipate }}
                      </button>
                      <div v-if="ticketError" class="text-brand-error text-xs bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5 mt-2">{{ ticketError }}</div>
                    </template>
                    <div v-else-if="isSoldOut(listing)"
                      class="flex items-center gap-2 bg-brand-success/10 border border-brand-success/20 rounded-2xl px-4 py-3">
                      <BIcon name="Trophy" class="w-5 h-5 text-brand-success" />
                      <p class="text-xs font-bold text-brand-success">{{ langStore.t.dealerListingRaffleEnded }}</p>
                    </div>
                  </div>
                </div>
              </template>

              <!-- ── COMMISSION QUEUE ──────────────────────────────────── -->
              <template v-else-if="listing.listing_kind === 'commission_queue'">
                <div class="lg:sticky lg:top-24">
                  <CommissionOrderPanel
                    :listing="listing"
                    :avg-rating="reviewAvg"
                    :review-count="reviews.length"
                    @booked="() => { if (listing) listing.commission_slots_taken++ }"
                  />
                </div>
              </template>

              <!-- ── FIXED ───────────────────────────────────────────────── -->
              <template v-else>
                <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                  <div class="p-5 stack-y-4">
                    <ListingPanelHead :listing="listing" :theme="kindTheme" :wishlist-count="wishlistCount" />
                    <!-- Avatar frame preview: rendered on the viewer's own avatar, using the
                         seller's chosen default calibration from the submission editor. -->
                    <div v-if="isAvatarFrame" class="flex justify-center py-2">
                      <FrameEditor
                        :avatar-url="auth.avatarUrl || '/icons/badges/NN.jpg'"
                        :frame-image-url="listing.images[0]"
                        :model-value="frameCalibration"
                        :draggable="false"
                        :size="160"
                      />
                    </div>
                    <div class="flex items-end justify-between">
                      <div>
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-1">{{ langStore.t.dealerListingPriceLabel }}</p>
                        <p class="text-4xl font-black leading-none tabular-nums"
                          :class="isSoldOut(listing) ? 'text-white/30 line-through' : 'text-brand-yellow'">
                          {{ parseFloat(String(listing.price)) === 0 ? langStore.t.dealerListingFreePrice : formatPrice(listing.price, listing.currency) }}
                        </p>
                      </div>
                      <div v-if="listing.quantity > 1" class="text-right">
                        <p class="text-[9px] text-white/35 uppercase tracking-wider font-bold mb-1">{{ langStore.t.dealerListingInStockLabel }}</p>
                        <p class="text-2xl font-black text-white leading-none tabular-nums">
                          {{ listing.quantity - (listing.quantity_sold ?? 0) }}
                        </p>
                        <p class="text-[9px] text-white/25 mt-0.5">{{ langStore.t.dealerListingOutOfPrefix }} {{ listing.quantity }} {{ langStore.t.dealerListingPiecesUnit }}</p>
                      </div>
                    </div>
                    <div v-if="isSoldOut(listing)"
                      class="flex items-center gap-2 bg-brand-error/10 border border-brand-error/20 rounded-2xl px-4 py-3">
                      <BIcon name="PackageX" class="w-5 h-5 text-brand-error" />
                      <p class="text-xs font-bold text-brand-error">{{ langStore.t.dealerListingOutOfStock }}</p>
                    </div>
                    <template v-else-if="isAvatarFrame">
                      <div v-if="listing.avatarFrame?.status === 'pending'"
                        class="flex items-center gap-2 bg-brand-yellow/10 border border-brand-yellow/20 rounded-2xl px-4 py-3">
                        <BIcon name="Clock" class="w-4 h-4 text-brand-yellow" />
                        <p class="text-xs font-bold text-brand-yellow">{{ langStore.t.avatarFramePendingBadge }}</p>
                      </div>
                      <div v-else-if="listing.avatarFrame?.status === 'rejected'"
                        class="flex items-center gap-2 bg-brand-error/10 border border-brand-error/20 rounded-2xl px-4 py-3">
                        <BIcon name="X" class="w-4 h-4 text-brand-error" />
                        <p class="text-xs font-bold text-brand-error">{{ listing.avatarFrame?.rejection_reason || langStore.t.avatarFrameSubmitFailed }}</p>
                      </div>
                      <button v-else-if="!auth.user" @click="router.push({ name: 'login' })"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white/60 font-bold rounded-2xl border border-brand-border hover:border-brand-accent/40 hover:text-white transition-all text-sm">
                        <BIcon name="LogIn" class="w-4 h-4" /> {{ langStore.t.dealerListingLoginToBuy }}
                      </button>
                      <button v-else-if="frameOwned" disabled
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white/40 font-bold rounded-2xl border border-brand-border text-sm cursor-default">
                        <BIcon name="Check" class="w-4 h-4" /> {{ langStore.t.avatarFrameClaimedBtn }}
                      </button>
                      <button v-else @click="claimFrame" :disabled="isClaimingFrame"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white font-extrabold rounded-2xl transition-all shadow-lg hover:opacity-90 active:scale-[0.98] text-sm disabled:opacity-50"
                        style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                        <span v-if="isClaimingFrame" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <BIcon v-else name="Sparkles" class="w-4 h-4" /> {{ langStore.t.avatarFrameClaimBtn }}
                      </button>
                      <p v-if="claimFrameError" class="text-xs text-brand-error mt-2">{{ claimFrameError }}</p>
                    </template>
                    <template v-else>
                      <button v-if="auth.user && auth.user.id !== listing.seller_id"
                        @click="contactSeller"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white font-extrabold rounded-2xl transition-all shadow-lg hover:opacity-90 active:scale-[0.98] text-sm"
                        style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                        <BIcon name="MessageCircle" class="w-4 h-4" /> {{ langStore.t.dealerListingMessageSellerBtn }}
                      </button>
                      <button v-else-if="!auth.user" @click="router.push({ name: 'login' })"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-white/60 font-bold rounded-2xl border border-brand-border hover:border-brand-accent/40 hover:text-white transition-all text-sm">
                        <BIcon name="LogIn" class="w-4 h-4" /> {{ langStore.t.dealerListingLoginToBuy }}
                      </button>
                    </template>
                    <div class="flex gap-2 flex-wrap">
                      <span class="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border"
                        :class="listing.type === 'digital'  ? 'bg-brand-accent/10 border-brand-accent/25 text-brand-accent'
                               : listing.type === 'physical' ? 'bg-brand-success/10 border-brand-success/25 text-brand-success'
                               : 'bg-brand-yellow/10 border-brand-yellow/25 text-brand-yellow'">
                        <BIcon :name="listing.type === 'digital' ? 'Download' : listing.type === 'physical' ? 'Package' : 'Layers'" class="w-3 h-3" />
                        {{ TYPE_LABELS[listing.type] }}
                      </span>
                      <span v-if="listing.is_nsfw" class="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border bg-brand-error/10 border-brand-error/25 text-brand-error">
                        <BIcon name="EyeOff" class="w-3 h-3" /> 18+
                      </span>
                    </div>
                  </div>
                </div>
              </template>

            </div>
          </div>

          <!-- ═══ REVIEWS ══════════════════════════════════════════════════ -->
          <div v-if="!isCommission" class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
            <div class="px-6 py-4 border-b border-brand-border flex items-center justify-between">
              <h3 class="text-sm font-extrabold text-white/60 uppercase tracking-widest flex items-center gap-2">
                <BIcon name="Star" class="w-4 h-4 text-brand-yellow" /> {{ langStore.t.dealerListingReviewsTitle }}
              </h3>
              <div class="flex items-center gap-3">
                <span v-if="reviews.length" class="text-xs text-white/30">{{ reviews.length }}</span>
                <button v-if="canLeaveReview" @click="showReviewForm = !showReviewForm"
                  class="text-xs px-3 py-1.5 rounded-lg font-bold transition-all"
                  :style="`background: linear-gradient(135deg, ${kindTheme.from}, ${kindTheme.to}); color: #fff`">
                  {{ showReviewForm ? langStore.t.cancel : langStore.t.dealerListingLeaveReviewBtn }}
                </button>
              </div>
            </div>

            <!-- Review form -->
            <div v-if="showReviewForm" class="p-5 border-b border-brand-border stack-y-4">
              <!-- Stars -->
              <div class="flex items-center gap-1">
                <button v-for="s in 5" :key="s" @click="reviewRating = s"
                  class="text-2xl transition-transform hover:scale-110">
                  <span :class="s <= reviewRating ? 'text-brand-yellow' : 'text-white/20'">★</span>
                </button>
                <span class="text-xs text-white/40 ml-2">{{ reviewRating }}/5</span>
              </div>
              <!-- Tags -->
              <div class="flex flex-wrap gap-2">
                <button v-for="tag in REVIEW_TAGS" :key="tag" @click="toggleReviewTag(tag)"
                  class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                  :class="reviewTags.includes(tag)
                    ? 'border-brand-accent bg-brand-accent/20 text-brand-accent'
                    : 'border-white/10 text-white/40 hover:border-white/20'">
                  {{ tag }}
                </button>
              </div>
              <!-- Text -->
              <textarea v-model="reviewText" rows="3" :placeholder="langStore.t.dealerListingReviewPlaceholder"
                class="w-full bg-[#0a0a1a] border border-white/8 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-white/20 resize-none" />
              <div v-if="reviewError" class="text-xs text-brand-error">{{ reviewError }}</div>
              <button @click="submitReview" :disabled="isPostingReview || reviewRating === 0"
                class="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-30 transition-all hover:opacity-90"
                :style="`background: linear-gradient(135deg, ${kindTheme.from}, ${kindTheme.to})`">
                <BIcon name="Send" class="w-3.5 h-3.5" />
                {{ isPostingReview ? langStore.t.helpSubmitting : langStore.t.publish }}
              </button>
            </div>

            <!-- Reviews list -->
            <div class="divide-y divide-brand-border">
              <div v-if="reviews.length === 0" class="py-10 text-center text-white/20 text-sm">
                <BIcon name="Star" class="w-8 h-8 mx-auto mb-2 opacity-20" />
                {{ langStore.t.dealerListingNoReviewsYet }}
              </div>
              <div v-for="review in reviews" :key="review.id" class="px-6 py-4">
                <DenReviewCard :review="review" />
              </div>
            </div>
          </div>

          <!-- ═══ COMMENTS ══════════════════════════════════════════════════ -->
          <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
            <div class="px-6 py-4 border-b border-brand-border flex items-center justify-between">
              <h3 class="text-sm font-extrabold text-white/60 uppercase tracking-widest flex items-center gap-2">
                <BIcon name="MessageSquare" class="w-4 h-4" :style="`color: ${kindTheme.accent}`" />
                {{ isCommission ? 'Вопросы художнику' : langStore.t.comments }}
              </h3>
              <span class="text-xs text-white/30 font-medium">{{ comments.length }}</span>
            </div>

            <!-- Comment form -->
            <div v-if="auth.user" class="p-5 border-b border-brand-border">
              <div class="flex gap-3">
                <img v-if="auth.user.avatar_url" :src="auth.user.avatar_url"
                  class="w-9 h-9 rounded-full object-cover border border-brand-border shrink-0 mt-0.5" />
                <div v-else class="w-9 h-9 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-extrabold text-sm shrink-0 mt-0.5 border border-brand-border">
                  {{ (auth.user.display_name ?? auth.user.username ?? 'U')[0].toUpperCase() }}
                </div>
                <div class="flex-1 stack-y-2">
                  <textarea v-model="commentBody" rows="2" :placeholder="langStore.t.dealerListingCommentPlaceholder"
                    class="w-full bg-[#0a0a1a] border border-white/8 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-white/20 resize-none transition-all" />
                  <button @click="postComment" :disabled="isPostingComment || !commentBody.trim()"
                    class="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-30 hover:opacity-90"
                    :style="`background: linear-gradient(135deg, ${kindTheme.from}, ${kindTheme.to})`">
                    <BIcon name="Send" class="w-3.5 h-3.5" />
                    {{ isPostingComment ? langStore.t.helpSubmitting : langStore.t.send }}
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="px-6 py-4 border-b border-brand-border text-center">
              <button @click="router.push({ name: 'login' })" class="text-sm text-brand-accent font-semibold hover:underline">{{ langStore.t.dealerListingLoginPrompt }}</button>
              <span class="text-sm text-white/30">{{ langStore.t.dealerListingToCommentSuffix }}</span>
            </div>

            <!-- Comments list -->
            <div class="divide-y divide-brand-border">
              <div v-if="comments.length === 0" class="py-12 text-center text-white/20 text-sm">
                <BIcon name="MessageSquareDashed" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                {{ langStore.t.dealerListingNoCommentsYet }}
              </div>

              <div v-for="comment in comments" :key="comment.id" class="px-6 py-4 stack-y-3">
                <div class="flex gap-3">
                  <div class="cursor-pointer shrink-0" @click="router.push(`/profile/${comment.author.username}`)">
                    <img v-if="comment.author.avatar_url" :src="comment.author.avatar_url"
                      class="w-9 h-9 rounded-full object-cover border border-brand-border hover:border-brand-accent transition-colors" />
                    <div v-else class="w-9 h-9 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-extrabold border border-brand-border hover:border-brand-accent transition-colors">
                      {{ (comment.author.display_name ?? comment.author.username)[0].toUpperCase() }}
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                      <span class="text-sm font-bold text-white hover:text-brand-accent transition-colors cursor-pointer"
                        @click="router.push(`/profile/${comment.author.username}`)">
                        {{ comment.author.display_name ?? comment.author.username }}
                      </span>
                      <BIcon v-if="comment.author.is_verified" name="BadgeCheck" class="w-3.5 h-3.5 text-brand-accent shrink-0" :title="langStore.t.verBadgeGenericLabel" />
                      <span class="text-[10px] text-white/25">{{ formatDate(comment.created_at) }}, {{ formatTime(comment.created_at) }}</span>
                    </div>
                    <p class="text-sm text-white/75 leading-relaxed whitespace-pre-line">{{ comment.body }}</p>
                    <div class="flex items-center gap-3 mt-2">
                      <button v-if="auth.user" @click="replyTo = replyTo?.id === comment.id ? null : comment"
                        class="flex items-center gap-1 text-[10px] text-white/35 hover:text-white transition-colors font-medium">
                        <BIcon name="CornerDownRight" class="w-3 h-3" /> {{ langStore.t.reply }}
                      </button>
                      <button v-if="auth.user?.id === comment.author_id" @click="removeComment(comment)"
                        class="flex items-center gap-1 text-[10px] text-brand-error/40 hover:text-brand-error transition-colors font-medium">
                        <BIcon name="Trash2" class="w-3 h-3" /> {{ langStore.t.deleteBtn }}
                      </button>
                    </div>

                    <!-- Reply form -->
                    <div v-if="replyTo?.id === comment.id" class="mt-3 flex gap-2">
                      <textarea v-model="replyBody" rows="2" :placeholder="`${langStore.t.reply} ${comment.author.display_name ?? comment.author.username}…`"
                        class="flex-1 bg-[#0a0a1a] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 outline-hidden focus:border-white/15 resize-none transition-all" />
                      <div class="flex flex-col gap-1.5 shrink-0">
                        <button @click="postReply(comment)" :disabled="!replyBody.trim()"
                          class="px-3 py-2 text-white text-xs font-bold rounded-xl disabled:opacity-30 transition-all"
                          :style="`background: linear-gradient(135deg, ${kindTheme.from}, ${kindTheme.to})`">
                          <BIcon name="Send" class="w-3 h-3" />
                        </button>
                        <button @click="replyTo = null; replyBody = ''"
                          class="px-3 py-2 border border-white/8 text-white/30 text-xs font-bold rounded-xl hover:bg-white/5 transition-all">
                          <BIcon name="X" class="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Replies -->
                <div v-if="comment.replies?.length" class="ml-12 stack-y-3 border-l-2 border-brand-border pl-4">
                  <div v-for="reply in comment.replies" :key="reply.id" class="flex gap-2.5">
                    <div class="cursor-pointer shrink-0" @click="router.push(`/profile/${reply.author.username}`)">
                      <img v-if="reply.author.avatar_url" :src="reply.author.avatar_url"
                        class="w-7 h-7 rounded-full object-cover border border-brand-border hover:border-brand-accent transition-colors" />
                      <div v-else class="w-7 h-7 rounded-full bg-brand-accent/15 flex items-center justify-center text-brand-accent text-xs font-extrabold border border-brand-border">
                        {{ (reply.author.display_name ?? reply.author.username)[0].toUpperCase() }}
                      </div>
                    </div>
                    <div class="flex-1">
                      <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span class="text-xs font-bold text-white/80 cursor-pointer hover:text-brand-accent transition-colors"
                          @click="router.push(`/profile/${reply.author.username}`)">
                          {{ reply.author.display_name ?? reply.author.username }}
                        </span>
                        <BIcon v-if="reply.author.is_verified" name="BadgeCheck" class="w-3 h-3 text-brand-accent shrink-0" :title="langStore.t.verBadgeGenericLabel" />
                        <span class="text-[9px] text-white/20">{{ formatTime(reply.created_at) }}</span>
                      </div>
                      <p class="text-xs text-white/65 leading-relaxed">{{ reply.body }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </template>
      </main>
    </div>

    <!-- ═══════════════════════════════════════════════════════════
         EDIT MODAL
    ═══════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/70 backdrop-blur-xs" @click="showEditModal = false" />
          <div class="relative bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-none">
            <!-- Header -->
            <div class="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-brand-border bg-brand-card rounded-t-3xl">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                  <BIcon name="Pencil" class="w-4 h-4 text-white" />
                </div>
                <h2 class="text-sm font-extrabold text-white uppercase tracking-widest">{{ langStore.t.editPost }}</h2>
              </div>
              <button @click="showEditModal = false" class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                <BIcon name="X" class="w-4 h-4 text-white/60" />
              </button>
            </div>

            <div class="p-5 stack-y-4">
              <!-- Title -->
              <div class="stack-y-1.5">
                <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.dealerListingTitleRequiredLabel }}</label>
                <input v-model="editForm.title" type="text" :placeholder="langStore.t.dealerListingTitlePlaceholder"
                  class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-brand-accent/50 transition-all" />
              </div>

              <!-- Description -->
              <div class="stack-y-1.5">
                <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.fursuitDescLabel }}</label>
                <textarea v-model="editForm.description" rows="3" :placeholder="langStore.t.dealerListingDescPlaceholder"
                  class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-brand-accent/50 transition-all resize-none" />
              </div>

              <!-- Price + Currency -->
              <div class="grid grid-cols-2 gap-3">
                <div class="stack-y-1.5">
                  <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.dealerListingPriceLabel }}</label>
                  <input v-model.number="editForm.price" type="number" min="0" step="0.01"
                    class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-hidden focus:border-brand-accent/50 transition-all" />
                </div>
                <div class="stack-y-1.5">
                  <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.dealerListingCurrencyLabel }}</label>
                  <select v-model="editForm.currency"
                    class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-hidden focus:border-brand-accent/50 transition-all appearance-none cursor-pointer">
                    <option>USD</option><option>RUB</option><option>EUR</option>
                  </select>
                </div>
              </div>

              <!-- Quantity + Status -->
              <div class="grid grid-cols-2 gap-3">
                <div class="stack-y-1.5">
                  <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.dealerListingQuantityLabel }}</label>
                  <input v-model.number="editForm.quantity" type="number" min="1"
                    class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-hidden focus:border-brand-accent/50 transition-all" />
                </div>
                <div class="stack-y-1.5">
                  <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.statusFieldLabel }}</label>
                  <select v-model="editForm.status"
                    class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-sm outline-hidden focus:border-brand-accent/50 transition-all appearance-none cursor-pointer"
                    :class="editForm.status === 'active' ? 'text-brand-success'
                           : editForm.status === 'draft' ? 'text-white/40'
                           : editForm.status === 'archived' ? 'text-white/30'
                           : 'text-brand-error'">
                    <option value="active">{{ langStore.t.dealerListingStatusActive }}</option>
                    <option value="draft">{{ langStore.t.dealerListingStatusDraft }}</option>
                    <option value="archived">{{ langStore.t.archiveBtn }}</option>
                    <option value="sold">{{ langStore.t.dealerListingStatusSold }}</option>
                  </select>
                </div>
              </div>

              <!-- Tags -->
              <div class="stack-y-1.5">
                <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.dealerListingTagsLabel }}</label>
                <input v-model="editForm.tags" type="text" :placeholder="langStore.t.dealerListingTagsPlaceholder"
                  class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-brand-accent/50 transition-all" />
              </div>

              <!-- Images -->
              <div class="stack-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.dealerListingImagesLabel }}</label>
                  <button @click="addImageUrl" type="button"
                    class="flex items-center gap-1 text-[10px] font-bold text-brand-accent hover:text-white transition-colors">
                    <BIcon name="Plus" class="w-3 h-3" /> {{ langStore.t.addButton }}
                  </button>
                </div>
                <div v-for="(img, i) in editForm.images" :key="i" class="flex gap-2 items-center">
                  <input v-model="editForm.images[i]" type="url" placeholder="https://…"
                    class="flex-1 bg-[#0a0a1a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 outline-hidden focus:border-brand-accent/40 transition-all" />
                  <button @click="removeImage(i)" type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-error/10 text-brand-error/60 hover:bg-brand-error/20 hover:text-brand-error transition-all shrink-0">
                    <BIcon name="Trash2" class="w-3.5 h-3.5" />
                  </button>
                </div>
                <div v-if="!editForm.images.length" class="text-xs text-white/20 italic">{{ langStore.t.dealerListingNoImages }}</div>
              </div>

              <!-- NSFW toggle -->
              <div class="flex items-center justify-between bg-brand-bg/50 border border-brand-border rounded-2xl px-4 py-3">
                <div class="flex items-center gap-2">
                  <BIcon name="EyeOff" class="w-4 h-4 text-brand-error/60" />
                  <span class="text-sm font-medium text-white/70">{{ langStore.t.dealerListingNsfwContent }}</span>
                </div>
                <button type="button" @click="editForm.isNsfw = !editForm.isNsfw"
                  class="w-10 h-5.5 rounded-full transition-all relative shrink-0"
                  :class="editForm.isNsfw ? 'bg-brand-error' : 'bg-white/10'">
                  <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all"
                    :class="editForm.isNsfw ? 'left-5.5' : 'left-0.5'" />
                </button>
              </div>

              <!-- Preview of first image -->
              <div v-if="editForm.images[0]" class="rounded-2xl overflow-hidden aspect-video bg-black/40">
                <img :src="editForm.images[0]" class="w-full h-full object-contain" />
              </div>

              <!-- Actions -->
              <div class="flex gap-3 pt-1">
                <button @click="showEditModal = false" type="button"
                  class="flex-1 py-3 border border-brand-border text-white/40 text-sm font-bold rounded-2xl hover:bg-white/5 transition-all">
                  {{ langStore.t.cancel }}
                </button>
                <button @click="submitEdit" :disabled="isUpdating || !editForm.title.trim()" type="button"
                  class="flex-1 flex items-center justify-center gap-2 py-3 text-white text-sm font-extrabold rounded-2xl disabled:opacity-30 transition-all hover:opacity-90"
                  style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                  <span v-if="isUpdating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <BIcon v-else name="Check" class="w-4 h-4" />
                  {{ isUpdating ? langStore.t.savingLabel : langStore.t.dealerListingSaveBtn }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════════════════════════════════════════════
         REPORT MODAL
    ═══════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showReportModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/70 backdrop-blur-xs" @click="showReportModal = false" />
          <div class="relative bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-brand-error/15 flex items-center justify-center">
                  <BIcon name="Flag" class="w-4 h-4 text-brand-error" />
                </div>
                <h2 class="text-sm font-extrabold text-white">{{ langStore.t.report }}</h2>
              </div>
              <button @click="showReportModal = false" class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                <BIcon name="X" class="w-4 h-4 text-white/60" />
              </button>
            </div>

            <!-- Success state -->
            <div v-if="reportSuccess" class="p-8 text-center stack-y-3">
              <div class="w-14 h-14 rounded-full bg-brand-success/15 flex items-center justify-center mx-auto">
                <BIcon name="CheckCircle2" class="w-8 h-8 text-brand-success" />
              </div>
              <p class="font-bold text-white">{{ langStore.t.reportSent }}</p>
              <p class="text-sm text-white/40">{{ langStore.t.dealerListingReportReviewNote }}</p>
            </div>

            <!-- Form -->
            <div v-else class="p-5 stack-y-4">
              <p class="text-xs text-white/50">{{ langStore.t.dealerListingReportPrompt }}</p>
              <!-- Reason buttons -->
              <div class="stack-y-2">
                <button v-for="r in REPORT_REASONS" :key="r" type="button"
                  @click="reportReason = r"
                  class="w-full text-left px-4 py-3 rounded-2xl text-sm transition-all border"
                  :class="reportReason === r
                    ? 'bg-brand-error/15 border-brand-error/40 text-white font-bold'
                    : 'bg-brand-bg/50 border-brand-border text-white/50 hover:border-white/20 hover:text-white'">
                  {{ r }}
                </button>
              </div>

              <!-- Custom reason -->
              <Transition name="fade">
                <div v-if="reportReason === langStore.t.other" class="stack-y-1.5">
                  <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.dealerListingDescribeProblemLabel }}</label>
                  <textarea v-model="reportCustom" rows="3" :placeholder="langStore.t.dealerListingReportDetailPlaceholder"
                    class="w-full bg-[#0a0a1a] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-brand-error/30 resize-none transition-all" />
                </div>
              </Transition>

              <!-- Actions -->
              <div class="flex gap-3">
                <button @click="showReportModal = false" type="button"
                  class="flex-1 py-3 border border-brand-border text-white/40 text-sm font-bold rounded-2xl hover:bg-white/5 transition-all">
                  {{ langStore.t.cancel }}
                </button>
                <button @click="submitReport" :disabled="isReporting || !reportReason" type="button"
                  class="flex-1 flex items-center justify-center gap-2 py-3 text-white text-sm font-extrabold rounded-2xl disabled:opacity-30 transition-all hover:opacity-90"
                  style="background: linear-gradient(135deg, #c0392b, #922b21)">
                  <span v-if="isReporting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <BIcon v-else name="Flag" class="w-4 h-4" />
                  {{ isReporting ? langStore.t.helpSubmitting : langStore.t.send }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }

.modal-enter-active, .modal-leave-active { transition: all 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(0.96); }

.fade-enter-active, .fade-leave-active { transition: all 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }

.fade-up-enter-active, .fade-up-leave-active { transition: all 0.3s ease; }
.fade-up-enter-from, .fade-up-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }
</style>
