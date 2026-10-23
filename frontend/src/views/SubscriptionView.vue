<script setup lang="ts">
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed } from 'vue'
import { useAuthStore, cacheUser } from '@/stores/auth'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import SubscriptionPaymentModal from '@/components/SubscriptionPaymentModal.vue'
import { blmLocal } from '@/lib/format'

const auth = useAuthStore()

const nsfwMode   = ref(false)
const billing    = ref<'monthly' | 'yearly'>('monthly')
const toast      = ref('')
const activeNav  = ref('subscriptions')
const payingPlan = ref<Plan | null>(null)

// Цены в BLM (1 BLM = 1 $) — те же, что в backend/payments/pricing.ts; сумму к оплате считает сервер.
// Ранние пользователи = зарегистрировались до 1 января 2027 — постоянная скидка -50%
const EARLY_USER_CUTOFF = '2027-01-01T00:00:00Z'
const EARLY_USER_DISCOUNT = 50 // %

const isEarlyUser = computed(() => {
  const created = auth.user?.created_at
  if (!created) return false
  return new Date(created) < new Date(EARLY_USER_CUTOFF)
})

const currentTier = computed(() => auth.user?.subscription_tier ?? 'free')
// Оплаченный период: тариф с датой окончания можно продлить. Без даты — выдан бессрочно
const expiresAt = computed(() => auth.user?.subscription_expires_at ?? null)
const canExtend = (planId: string) => planId === currentTier.value && !!expiresAt.value
const isLocked  = (planId: string) => planId === currentTier.value && !canExtend(planId)
const expiresLabel = computed(() =>
  expiresAt.value ? new Date(expiresAt.value).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'long', year: 'numeric' }) : '')

type Plan = {
  id:         string
  label:      string
  icon:       string
  badge:      string
  badgeColor: string
  priceM:     number
  priceY:     number
  color:      string
  gradient:   string
  iconBg:     string
  features:   string[]
  featured?:  boolean
}

const plans = computed<Plan[]>(() => {
  const t = langStore.t
  return [
    {
      id: 'free', label: 'Free',
      icon: 'Gift',
      badge: t.planBadgeFree,
      badgeColor: 'text-white/55 bg-white/5 border-white/10',
      priceM: 0, priceY: 0,
      color: 'text-white/70',
      gradient: 'from-white/5 to-white/2',
      iconBg: 'bg-white/8 text-white/60 border-white/10',
      features: [t.featUnlimitedPosts, t.featFollowAuthors, t.featBasicNotifs, t.featPmUnlimited, t.featFilesFree, t.featDenAccess, t.featDenSell, t.featZeroFee],
    },
    {
      id: 'lite', label: 'Lite',
      icon: 'Zap',
      badge: t.planBadgePopular,
      badgeColor: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
      priceM: 2, priceY: 1.5,
      color: 'text-sky-400',
      gradient: 'from-sky-500/12 to-sky-500/3',
      iconBg: 'bg-sky-400/10 text-sky-400 border-sky-400/25',
      features: [t.featAllFree, t.featNoAds, t.featProfileTheme, t.featLiteBadge, t.featProfileStats, t.featFilesLite],
    },
    {
      id: 'pro', label: 'Pro',
      icon: 'Crown',
      badge: t.planBadgeBest,
      badgeColor: 'text-brand-accent bg-brand-accent/10 border-brand-accent/20',
      priceM: 4, priceY: 3,
      color: 'text-brand-accent',
      gradient: 'from-brand-accent/18 to-brand-accent/3',
      iconBg: 'bg-brand-accent/15 text-brand-accent-minus border-brand-accent/30',
      featured: true,
      features: [t.featAllLite, t.featFilesPro, t.featCommissionsOpen, t.featSearchPriority, t.featSteamTheme, t.featCustomBg, t.featAvatarFrames, t.featProBadge, t.featPostAnalytics, t.featDenFastBumps, t.featAdDiscount15, t.featWithdraw2],
    },
    {
      id: 'business', label: 'Business',
      icon: 'Briefcase',
      badge: t.planBadgeBusiness,
      badgeColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
      priceM: 10, priceY: 7.5,
      color: 'text-amber-400',
      gradient: 'from-amber-400/12 to-amber-400/3',
      iconBg: 'bg-amber-400/10 text-amber-400 border-amber-400/25',
      features: [t.featAllPro, t.featFilesBusiness, t.featPostBoosts, t.featPromoCashback, t.featAutoBump, t.featAdDiscount30, t.featWithdraw1, t.featAdvAnalytics, t.featPrioritySupport, t.featEarlyAccess],
    },
  ]
})

// Цена «по билету» — то, во сколько план обойдётся при выбранном режиме оплаты,
// с дополнительной постоянной скидкой для ранних пользователей.
function effectivePrice(plan: Plan): number {
  const base = billing.value === 'yearly' ? plan.priceY : plan.priceM
  if (base === 0) return 0
  return isEarlyUser.value ? Math.round(base * (1 - EARLY_USER_DISCOUNT / 100) * 100) / 100 : base
}

// Цена-ценник для зачёркивания — всегда полная ежемесячная цена без скидок,
// чтобы показать суммарную выгоду (годовая оплата + скидка ранним пользователям).
function originalPrice(plan: Plan): number {
  return plan.priceM
}

// Экономия от полной ежемесячной цены в процентах — то самое число в зачёркнутом ценнике.
function totalDiscountPercent(plan: Plan): number {
  if (!plan.priceM) return 0
  return Math.round((1 - effectivePrice(plan) / plan.priceM) * 100)
}

// Выгода от годовой оплаты (без учёта скидки ранних пользователей) — используется на переключателе.
function yearlySavingsPercent(plan: Plan): number {
  if (!plan.priceM) return 0
  return Math.round((1 - plan.priceY / plan.priceM) * 100)
}

const avgYearlySavings = computed(() => {
  const paid = plans.value.filter(p => p.priceM > 0)
  if (!paid.length) return 0
  return Math.round(paid.reduce((sum, p) => sum + yearlySavingsPercent(p), 0) / paid.length)
})

/** «≈ 90 ₽» в валюте региона или пустая строка */
const local = (blm: number) => { const v = blmLocal(blm); return v ? `≈ ${v}` : '' }

function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 3000)
}

function selectPlan(planId: string) {
  if (isLocked(planId)) return
  if (planId === 'free') { showToast(langStore.t.subToastFreeInfo); return }
  const plan = plans.value.find(p => p.id === planId)
  if (plan) payingPlan.value = plan
}

function onPaymentSuccess(planId: string, newExpiresAt: string | null) {
  if (auth.user) {
    ;auth.user.subscription_tier = planId
    auth.user.subscription_expires_at = newExpiresAt
    cacheUser(auth.user)
  }
  auth.fetchMe()
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito relative overflow-hidden">

    <!-- Ambient background glow -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-32 left-1/4 w-xl h-144 rounded-full bg-brand-accent/15 blur-[120px]" />
      <div class="absolute top-40 right-0 w-md h-112 rounded-full bg-sky-500/10 blur-[110px]" />
      <div class="absolute bottom-0 left-0 w-104 h-104 rounded-full bg-amber-400/8 blur-[110px]" />
    </div>

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toast"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl border pointer-events-none"
        :class="toast.includes('ошибка') || toast.includes('Ошибка')
          ? 'bg-brand-error/10 border-brand-error/30 text-brand-error'
          : 'bg-brand-success/10 border-brand-success/30 text-brand-success'">
        {{ toast }}
      </div>
    </Transition>

    <AppHeader v-model:nsfwMode="nsfwMode" />

    <div class="relative z-10 max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar v-model:activeNav="activeNav" />

      <main class="flex-1 min-w-0 pb-28 md:pb-20">

        <!-- Hero -->
        <div class="text-center mb-12 pt-4">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-xs font-bold uppercase tracking-widest mb-6 shadow-[0_0_24px_rgba(76,103,207,0.25)]">
            <BIcon name="Sparkles" class="w-3.5 h-3.5" />
            Bloomly Premium
          </div>
          <h1 class="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight bg-linear-to-b/srgb from-white to-white/70 bg-clip-text text-transparent">
            {{ langStore.t.subHeroTitle }}
          </h1>
          <p class="text-lg text-white/55 max-w-xl mx-auto">
            {{ langStore.t.subHeroDesc }}
          </p>

          <!-- Early user: постоянная скидка -50% -->
          <div v-if="isEarlyUser" class="early-banner relative mx-auto mt-8 max-w-2xl rounded-3xl p-[1.5px] text-left">
            <div class="relative overflow-hidden rounded-[22px] bg-brand-card/95 px-6 py-5 flex items-center gap-5">
              <div class="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-amber-400/20 blur-3xl pointer-events-none" />
              <div class="relative shrink-0 w-20 h-20 rounded-2xl bg-linear-to-br from-amber-300 to-orange-500 flex flex-col items-center justify-center shadow-[0_0_32px_rgba(251,191,36,0.45)]">
                <span class="text-2xl font-black text-white leading-none">−50%</span>
                <BIcon name="Star" class="w-3.5 h-3.5 mt-1 fill-white text-white" />
              </div>
              <div class="relative min-w-0">
                <div class="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">{{ langStore.t.subEarlyBadge }}</div>
                <div class="text-lg font-extrabold text-white leading-tight">{{ langStore.t.subEarlyTitle }}</div>
                <p class="text-sm text-white/55 mt-1">{{ langStore.t.subEarlyDesc }}</p>
                <div class="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-amber-300/90">
                  <BIcon name="Check" class="w-3.5 h-3.5" />
                  {{ langStore.t.subEarlySince }}
                </div>
              </div>
            </div>
          </div>

          <!-- Поздние пользователи: скидки нет -->
          <div v-else-if="auth.user && auth.user.created_at"
            class="mx-auto mt-8 max-w-2xl rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-5 flex items-center gap-5 text-left">
            <div class="shrink-0 w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <span class="text-lg font-black text-white/30 line-through">−50%</span>
            </div>
            <div class="min-w-0">
              <div class="text-base font-bold text-white/80">{{ langStore.t.subLateTitle }}</div>
              <p class="text-sm text-white/45 mt-1">{{ langStore.t.subLateDesc }}</p>
            </div>
          </div>

          <!-- Billing toggle -->
          <div class="relative inline-flex items-center gap-1 mt-8 p-1 rounded-2xl bg-brand-card border border-brand-border shadow-inner">
            <div class="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-xl bg-linear-to-b/srgb from-white/15 to-white/5 border border-white/10 shadow-lg transition-transform duration-300 ease-out"
              :class="billing === 'yearly' ? 'translate-x-[calc(100%+0.5rem)]' : 'translate-x-0'" />
            <button @click="billing = 'monthly'"
              class="relative z-10 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 active:scale-95"
              :class="billing === 'monthly' ? 'text-white' : 'text-white/50 hover:text-white/80'">
              {{ langStore.t.subMonthly }}
            </button>
            <button @click="billing = 'yearly'"
              class="relative z-10 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 active:scale-95"
              :class="billing === 'yearly' ? 'text-white' : 'text-white/50 hover:text-white/80'">
              {{ langStore.t.subYearly }}
              <span v-if="avgYearlySavings > 0" class="absolute -top-2.5 -right-3 text-[9px] font-black bg-brand-success text-white px-1.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(102,199,112,0.5)]">–{{ avgYearlySavings }}%</span>
            </button>
          </div>
        </div>

        <!-- Plans grid — ticket style -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12 items-start">
          <div
            v-for="plan in plans"
            :key="plan.id"
            class="relative ticket-card transition-all duration-300 hover:-translate-y-1.5 active:translate-y-0 active:scale-[0.985]"
            :class="[
              plan.featured ? 'md:-mt-3 z-10' : '',
              currentTier === plan.id ? 'ring-2 ring-brand-success ring-offset-2 ring-offset-brand-bg rounded-3xl' : '',
            ]"
          >
            <!-- Featured glow halo -->
            <div v-if="plan.featured"
              class="absolute -inset-1 rounded-[28px] opacity-60 blur-md bg-linear-to-b/srgb from-brand-accent/50 to-brand-accent/0 pointer-events-none featured-pulse" />

            <!-- Active glow -->
            <div v-if="currentTier === plan.id"
              class="absolute -inset-0.5 rounded-3xl opacity-30 blur-xs"
              :class="`bg-linear-to-b/srgb ${plan.gradient}`" />

            <!-- Ticket body -->
            <div class="relative rounded-3xl border overflow-hidden backdrop-blur-xs"
              :class="[
                `bg-linear-to-b/srgb ${plan.gradient}`,
                plan.featured ? 'border-brand-accent/60 shadow-2xl shadow-brand-accent/25' : 'border-brand-border',
              ]">

              <!-- Accent line top -->
              <div class="h-1 w-full" :class="plan.featured ? 'bg-linear-to-r/srgb from-brand-accent via-brand-accent-minus to-brand-accent' : 'bg-white/10'" />

              <!-- Top half: plan info -->
              <div class="px-5 pt-5 pb-4">
                <!-- Icon + badge row -->
                <div class="flex items-center justify-between mb-4">
                  <div class="w-11 h-11 rounded-2xl border flex items-center justify-center" :class="plan.iconBg">
                    <BIcon :name="plan.icon" class="w-5 h-5" />
                  </div>
                  <span class="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border flex items-center gap-1"
                    :class="[plan.badgeColor, plan.featured ? 'shadow-[0_0_16px_rgba(76,103,207,0.35)]' : '']">
                    <BIcon v-if="plan.featured" name="Sparkles" class="w-2.5 h-2.5" />
                    {{ plan.badge }}
                  </span>
                </div>

                <!-- Plan name -->
                <div class="flex items-center gap-2 mb-1">
                  <h2 class="text-2xl font-extrabold tracking-tight" :class="plan.color">{{ plan.label }}</h2>
                  <span v-if="currentTier === plan.id"
                    class="text-[10px] font-extrabold uppercase tracking-wider text-brand-success bg-brand-success/10 border border-brand-success/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <BIcon name="CheckCircle" class="w-3 h-3" /> {{ langStore.t.subActive }}
                  </span>
                </div>
                <p v-if="currentTier === plan.id && expiresLabel" class="text-[11px] text-white/45 mb-1">
                  {{ langStore.t.subActiveUntil }} {{ expiresLabel }}
                </p>

                <!-- Price -->
                <div class="mb-4">
                  <template v-if="plan.priceM === 0">
                    <p class="text-3xl font-extrabold text-white">{{ langStore.t.subFree }}</p>
                    <p class="text-xs text-white/35 mt-0.5">{{ langStore.t.subForever }}</p>
                  </template>
                  <template v-else>
                    <div class="flex items-end gap-1.5">
                      <p class="text-4xl font-extrabold tracking-tight" :class="plan.featured ? 'bg-linear-to-b/srgb from-white to-brand-accent-minus bg-clip-text text-transparent' : 'text-white'">{{ effectivePrice(plan) }} BLM</p>
                      <p class="text-sm text-white/55 mb-1.5">{{ langStore.t.subPerMonth }}</p>
                    </div>
                    <p v-if="local(effectivePrice(plan))" class="text-xs text-white/40 mt-0.5">{{ local(effectivePrice(plan)) }}</p>
                    <div class="flex items-center flex-wrap gap-1.5 mt-2 min-h-6">
                      <template v-if="totalDiscountPercent(plan) > 0">
                        <span class="text-xs text-white/35 line-through decoration-white/25">{{ originalPrice(plan) }} BLM</span>
                        <span class="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-lg border"
                          :class="isEarlyUser
                            ? 'text-amber-300 bg-linear-to-r/srgb from-amber-400/25 to-amber-500/10 border-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
                            : 'text-brand-success bg-brand-success/10 border-brand-success/20'">
                          <BIcon :name="isEarlyUser ? 'Star' : 'TrendingDown'" class="w-2.5 h-2.5" :class="isEarlyUser ? 'fill-amber-300' : ''" />
                          –{{ totalDiscountPercent(plan) }}%
                        </span>
                      </template>
                      <span v-if="billing === 'yearly'" class="text-[10px] text-white/35 w-full">
                        {{ Math.round(effectivePrice(plan) * 12 * 100) / 100 }} BLM{{ langStore.t.subYearlyTotal }}
                      </span>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Tear-line / perforation divider -->
              <div class="relative px-3 flex items-center gap-0 -my-0.5 z-10">
                <div class="w-5 h-5 rounded-full bg-brand-bg shrink-0 -ml-4 border border-brand-border" />
                <div class="flex-1 border-t-2 border-dashed border-white/12 mx-1" />
                <div class="w-5 h-5 rounded-full bg-brand-bg shrink-0 -mr-4 border border-brand-border" />
              </div>

              <!-- Bottom half: features + button -->
              <div class="px-5 pt-4 pb-5">
                <!-- Ticket stub meta -->
                <div class="flex items-center gap-2 text-[10px] text-white/35 mb-3 font-mono uppercase tracking-wider">
                  <BIcon name="Ticket" class="w-3 h-3" />
                  <span>Bloomly {{ plan.label.toUpperCase() }} PASS</span>
                </div>

                <!-- Features -->
                <ul class="stack-y-2.5 mb-5">
                  <li
                    v-for="feature in plan.features"
                    :key="feature"
                    class="flex items-start gap-2 text-xs text-white/65"
                  >
                    <span class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
                      :class="plan.iconBg">
                      <BIcon name="Check" class="w-2.5 h-2.5" />
                    </span>
                    {{ feature }}
                  </li>
                </ul>

                <!-- CTA -->
                <button
                  @click="selectPlan(plan.id)"
                  :disabled="isLocked(plan.id)"
                  class="w-full py-2.5 rounded-2xl text-sm font-bold transition-all duration-150 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.96] hover:brightness-110"
                  :class="isLocked(plan.id)
                    ? 'bg-brand-success/10 text-brand-success border border-brand-success/30'
                    : plan.id === 'free'
                      ? 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/70'
                      : plan.featured
                        ? 'bg-linear-to-r/srgb from-brand-accent to-brand-accent-plus text-white shadow-lg shadow-brand-accent/40 hover:shadow-brand-accent/60'
                        : 'bg-white/8 hover:bg-white/15 text-white border border-white/10'"
                >
                  <BIcon v-if="isLocked(plan.id)" name="CheckCircle" class="w-4 h-4" />
                  <BIcon v-else-if="canExtend(plan.id)" name="RefreshCw" class="w-4 h-4" />
                  <BIcon v-else-if="plan.id !== 'free'" name="Ticket" class="w-4 h-4" />
                  <span>
                    {{ isLocked(plan.id) ? langStore.t.subYourPlan : canExtend(plan.id) ? langStore.t.payExtendBtn : plan.id === 'free' ? langStore.t.subBasic : `${langStore.t.subActivatePrefix} ${plan.label}` }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- FAQ / Comparison highlights -->
        <div class="relative bg-brand-card border border-brand-border rounded-3xl p-8 mb-8 overflow-hidden">
          <div class="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand-accent/10 blur-[90px]" />
          <h2 class="relative text-xl font-extrabold text-white mb-6 flex items-center gap-2">
            <span class="w-9 h-9 rounded-xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center">
              <BIcon name="HelpCircle" class="w-[18px] h-[18px] text-brand-accent" />
            </span>
            {{ langStore.t.subFaqTitle }}
          </h2>
          <div class="relative grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 text-sm">
            <div v-for="faq in [
              { q: langStore.t.subFaqQ1, a: langStore.t.subFaqA1 },
              { q: langStore.t.subFaqQ2, a: langStore.t.subFaqA2 },
              { q: langStore.t.subFaqQ3, a: langStore.t.subFaqA3 },
              { q: langStore.t.subFaqQ4, a: langStore.t.subFaqA4 },
            ]" :key="faq.q"
              class="pb-6 border-b border-white/5 md:border-b-0 last:border-b-0 md:nth-last-[-n+2]:pb-0">
              <p class="font-bold text-white mb-1.5 flex items-center gap-2">
                <BIcon name="ChevronRight" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
                {{ faq.q }}
              </p>
              <p class="text-white/55 leading-relaxed pl-[22px]">{{ faq.a }}</p>
            </div>
          </div>
        </div>

      </main>
    </div>

    <SubscriptionPaymentModal
      v-if="payingPlan"
      :plan="payingPlan"
      :period="billing === 'yearly' ? 'year' : 'month'"
      :price="effectivePrice(payingPlan)"
      :original-price="originalPrice(payingPlan)"
      :discounted="totalDiscountPercent(payingPlan) > 0"
      @close="payingPlan = null"
      @success="onPaymentSuccess"
    />
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

.ticket-card {
  filter: drop-shadow(0 4px 24px rgba(0,0,0,0.35));
  transition: filter 0.2s, transform 0.2s;
}
.ticket-card:hover {
  filter: drop-shadow(0 8px 32px rgba(0,0,0,0.5));
}

.early-banner {
  background: linear-gradient(120deg, #fbbf24, #f97316, #fbbf24, #f97316);
  background-size: 300% 300%;
  animation: early-shine 6s linear infinite;
  box-shadow: 0 8px 40px rgba(251,191,36,0.18);
}
@keyframes early-shine {
  0% { background-position: 0% 50%; }
  100% { background-position: 300% 50%; }
}

.featured-pulse {
  animation: featured-pulse 3.5s ease-in-out infinite;
}
@keyframes featured-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.75; }
}
</style>
