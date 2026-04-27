<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import api from '@/api'

const router = useRouter()
const auth   = useAuthStore()

const nsfwMode   = ref(false)
const billing    = ref<'monthly' | 'yearly'>('monthly')
const upgrading  = ref<string | null>(null)
const toast      = ref('')
const activeNav  = ref('subscriptions')

// Ранние пользователи = зарегистрировались до апреля 2026
const isEarlyUser = computed(() => {
  const created = (auth.user as any)?.created_at
  if (!created) return false
  return new Date(created) < new Date('2026-04-01T00:00:00Z')
})

const currentTier = computed(() => (auth.user as any)?.subscription_tier ?? 'free')

type Plan = {
  id:         string
  label:      string
  badge:      string
  badgeColor: string
  priceM:     number      // месячная цена (оригинал)
  priceY:     number      // годовая цена / мес
  discount:   number      // скидка ранних пользователей %
  color:      string      // accent CSS class
  gradient:   string      // card gradient
  features:   string[]
  featured?:  boolean
}

const plans: Plan[] = [
  {
    id:         'free',
    label:      'Free',
    badge:      'Бесплатно',
    badgeColor: 'text-white/55 bg-white/5 border-white/10',
    priceM:     0,
    priceY:     0,
    discount:   0,
    color:      'text-white/70',
    gradient:   'from-white/5 to-white/2',
    features: [
      'Публикации без ограничений',
      'Подписки на авторов',
      'Базовые уведомления',
      'Приват-сообщения (50/день)',
    ],
  },
  {
    id:         'lite',
    label:      'Lite',
    badge:      'Популярный',
    badgeColor: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    priceM:     149,
    priceY:     99,
    discount:   30,
    color:      'text-sky-400',
    gradient:   'from-sky-500/12 to-sky-500/3',
    features: [
      'Всё из Free',
      'Тема профиля на выбор',
      'Значок Lite',
      'Приоритетный поиск',
      'Сообщения без ограничений',
      'Хранилище медиа 5 ГБ',
    ],
  },
  {
    id:         'pro',
    label:      'Pro',
    badge:      'Лучший выбор',
    badgeColor: 'text-brand-accent bg-brand-accent/10 border-brand-accent/20',
    priceM:     349,
    priceY:     249,
    discount:   40,
    color:      'text-brand-accent',
    gradient:   'from-brand-accent/15 to-brand-accent/3',
    featured:   true,
    features: [
      'Всё из Lite',
      'Кастомный фон профиля',
      'Смена темы как в Steam',
      'Рамки для аватара',
      'Pro-значок + спецэффекты',
      'Хранилище медиа 20 ГБ',
      'Аналитика публикаций',
      'Эксклюзивные стикеры',
    ],
  },
  {
    id:         'business',
    label:      'Business',
    badge:      'Для creatorов',
    badgeColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    priceM:     899,
    priceY:     649,
    discount:   25,
    color:      'text-amber-400',
    gradient:   'from-amber-400/12 to-amber-400/3',
    features: [
      'Всё из Pro',
      'AD-профиль (реклама ваших работ)',
      'До 5 рекламных кампаний',
      'Поднятие постов в топ',
      'Расширенная аналитика',
      'Хранилище медиа 100 ГБ',
      'Приоритетная поддержка',
      'Ранний доступ к новым функциям',
    ],
  },
]

function effectivePrice(plan: Plan): number {
  const base = billing.value === 'yearly' ? plan.priceY : plan.priceM
  if (base === 0) return 0
  const disc = isEarlyUser.value ? plan.discount : 0
  return Math.round(base * (1 - disc / 100))
}

function originalPrice(plan: Plan): number {
  return billing.value === 'yearly' ? plan.priceY : plan.priceM
}

async function selectPlan(planId: string) {
  if (planId === currentTier.value || planId === 'free') return
  upgrading.value = planId
  try {
    await api.patch('/users/me/subscription', { tier: planId })
    // update local user state and persist
    if (auth.user) {
      ;(auth.user as any).subscription_tier = planId
      sessionStorage.setItem('auth_user', JSON.stringify(auth.user))
    }
    toast.value = `Подписка ${planId.charAt(0).toUpperCase() + planId.slice(1)} активирована!`
    setTimeout(() => { toast.value = '' }, 3000)
  } catch {
    toast.value = 'Ошибка при активации подписки'
    setTimeout(() => { toast.value = '' }, 3000)
  } finally { upgrading.value = null }
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">

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

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar v-model:activeNav="activeNav" />

      <main class="flex-1 min-w-0 pb-28 md:pb-20">

        <!-- Hero -->
        <div class="text-center mb-12 pt-4">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-xs font-bold uppercase tracking-widest mb-6">
            <BIcon name="Sparkles" class="w-3.5 h-3.5" />
            Bloomly Premium
          </div>
          <h1 class="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight">
            Раскрой свой потенциал
          </h1>
          <p class="text-lg text-white/55 max-w-xl mx-auto">
            Выбери план, который подойдёт тебе. Для творческих людей, которые хотят продвинуться.
          </p>

          <!-- Early user badge -->
          <div v-if="isEarlyUser"
            class="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm font-bold">
            <BIcon name="Star" class="w-4 h-4 fill-amber-400" />
            Ранний пользователь — скидка до 40%!
          </div>

          <!-- Billing toggle -->
          <div class="flex items-center justify-center gap-3 mt-8">
            <button @click="billing = 'monthly'"
              class="px-5 py-2.5 rounded-2xl text-sm font-bold transition-all"
              :class="billing === 'monthly' ? 'bg-brand-card text-white shadow-lg border border-brand-border' : 'text-white/55 hover:text-white'">
              Ежемесячно
            </button>
            <button @click="billing = 'yearly'"
              class="relative px-5 py-2.5 rounded-2xl text-sm font-bold transition-all"
              :class="billing === 'yearly' ? 'bg-brand-card text-white shadow-lg border border-brand-border' : 'text-white/55 hover:text-white'">
              Ежегодно
              <span class="absolute -top-2 -right-2 text-[9px] font-black bg-brand-success text-white px-1.5 py-0.5 rounded-full">–29%</span>
            </button>
          </div>
        </div>

        <!-- Plans grid — ticket style -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
          <div
            v-for="plan in plans"
            :key="plan.id"
            class="relative ticket-card transition-all duration-300"
            :class="[
              plan.featured ? 'scale-[1.03]' : '',
              currentTier === plan.id ? 'ring-2 ring-brand-success ring-offset-2 ring-offset-brand-bg rounded-3xl' : '',
            ]"
          >
            <!-- Active glow -->
            <div v-if="currentTier === plan.id"
              class="absolute -inset-0.5 rounded-3xl opacity-30 blur-sm"
              :class="`bg-gradient-to-b ${plan.gradient}`" />

            <!-- Ticket body -->
            <div class="relative rounded-3xl border overflow-hidden"
              :class="[
                `bg-gradient-to-b ${plan.gradient}`,
                plan.featured ? 'border-brand-accent/60 shadow-2xl shadow-brand-accent/20' : 'border-brand-border',
              ]">

              <!-- Accent line top -->
              <div class="h-1 w-full" :class="plan.featured ? 'bg-brand-accent' : 'bg-white/10'" />

              <!-- Top half: plan info -->
              <div class="px-5 pt-5 pb-4">
                <!-- Badge row -->
                <div class="flex items-center justify-between mb-3">
                  <span class="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border"
                    :class="plan.badgeColor">
                    {{ plan.badge }}
                  </span>
                  <div class="flex items-center gap-1.5">
                    <span v-if="currentTier === plan.id"
                      class="text-[10px] font-extrabold uppercase tracking-wider text-brand-success bg-brand-success/10 border border-brand-success/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <BIcon name="CheckCircle" class="w-3 h-3" /> Активен
                    </span>
                    <BIcon v-if="plan.featured" name="Sparkles" class="w-4 h-4 text-brand-accent" />
                  </div>
                </div>

                <!-- Plan name -->
                <h2 class="text-2xl font-extrabold tracking-tight mb-1" :class="plan.color">{{ plan.label }}</h2>

                <!-- Price -->
                <div class="mb-4">
                  <template v-if="plan.priceM === 0">
                    <p class="text-3xl font-extrabold text-white">Бесплатно</p>
                    <p class="text-xs text-white/35 mt-0.5">навсегда</p>
                  </template>
                  <template v-else>
                    <div class="flex items-end gap-1.5">
                      <p class="text-3xl font-extrabold text-white">{{ effectivePrice(plan) }} ₽</p>
                      <p class="text-sm text-white/55 mb-1">/ мес</p>
                    </div>
                    <div class="flex items-center gap-2 mt-1">
                      <span v-if="isEarlyUser && plan.discount > 0"
                        class="text-xs text-white/30 line-through">{{ originalPrice(plan) }} ₽</span>
                      <span v-if="isEarlyUser && plan.discount > 0"
                        class="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-lg border border-amber-400/20">
                        –{{ plan.discount }}%
                      </span>
                      <span v-if="billing === 'yearly'" class="text-[10px] text-white/35">
                        {{ effectivePrice(plan) * 12 }} ₽/год
                      </span>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Tear-line / perforation divider -->
              <div class="relative px-3 flex items-center gap-0 -my-0.5 z-10">
                <div class="w-5 h-5 rounded-full bg-brand-bg flex-shrink-0 -ml-4 border border-brand-border" />
                <div class="flex-1 border-t-2 border-dashed border-white/10 mx-1" />
                <div class="w-5 h-5 rounded-full bg-brand-bg flex-shrink-0 -mr-4 border border-brand-border" />
              </div>

              <!-- Bottom half: features + button -->
              <div class="px-5 pt-4 pb-5">
                <!-- Ticket stub meta -->
                <div class="flex items-center gap-2 text-[10px] text-white/35 mb-3 font-mono uppercase tracking-wider">
                  <BIcon name="Ticket" class="w-3 h-3" />
                  <span>Bloomly {{ plan.label.toUpperCase() }} PASS</span>
                </div>

                <!-- Features -->
                <ul class="space-y-2 mb-5">
                  <li
                    v-for="feature in plan.features"
                    :key="feature"
                    class="flex items-start gap-2 text-xs text-white/65"
                  >
                    <BIcon name="Check" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" :class="plan.color" />
                    {{ feature }}
                  </li>
                </ul>

                <!-- CTA -->
                <button
                  @click="selectPlan(plan.id)"
                  :disabled="currentTier === plan.id || plan.id === 'free' || upgrading === plan.id"
                  class="w-full py-2.5 rounded-2xl text-sm font-bold transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  :class="currentTier === plan.id
                    ? 'bg-brand-success/10 text-brand-success border border-brand-success/30'
                    : plan.id === 'free'
                      ? 'bg-white/5 text-white/30 border border-white/10'
                      : plan.featured
                        ? 'bg-brand-accent hover:bg-brand-accent-plus text-white shadow-lg shadow-brand-accent/30'
                        : 'bg-white/8 hover:bg-white/15 text-white border border-white/10'"
                >
                  <BIcon v-if="upgrading === plan.id" name="Loader2" class="w-4 h-4 animate-spin" />
                  <BIcon v-else-if="currentTier === plan.id" name="CheckCircle" class="w-4 h-4" />
                  <BIcon v-else-if="plan.id !== 'free'" name="Ticket" class="w-4 h-4" />
                  <span>
                    {{ upgrading === plan.id ? 'Активация…' : currentTier === plan.id ? 'Ваш план' : plan.id === 'free' ? 'Базовый' : `Активировать ${plan.label}` }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- FAQ / Comparison highlights -->
        <div class="bg-brand-card border border-brand-border rounded-3xl p-8 mb-8">
          <h2 class="text-xl font-extrabold text-white mb-6 flex items-center gap-2">
            <BIcon name="HelpCircle" class="w-5 h-5 text-brand-accent" />
            Часто задаваемые вопросы
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div v-for="faq in [
              { q: 'Могу ли я отменить подписку?', a: 'Да, в любой момент. Функции останутся до конца оплаченного периода.' },
              { q: 'Что значит «ранний пользователь»?', a: 'Пользователи, зарегистрировавшиеся до 1 апреля 2026 года, получают постоянную скидку.' },
              { q: 'Можно ли переключаться между планами?', a: 'Да, повысить план можно в любой момент. Понижение — со следующего расчётного периода.' },
              { q: 'Что такое AD-профиль?', a: 'Business-аккаунт позволяет продвигать свои работы и услуги как рекламодатель внутри Bloomly.' },
            ]" :key="faq.q">
              <div>
                <p class="font-bold text-white mb-1">{{ faq.q }}</p>
                <p class="text-white/55">{{ faq.a }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Back link -->
        <button @click="router.back()" class="flex items-center gap-2 text-sm text-white/55 hover:text-white transition-colors">
          <BIcon name="ArrowLeft" class="w-4 h-4" />
          Назад
        </button>

      </main>
    </div>
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
</style>
