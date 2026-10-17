<script setup lang="ts">
// Оплата виджетом ЮKassa на странице Bloomly: пользователь не покидает сайт,
// способ (карта / ЮMoney / СБП) выбирается внутри виджета. Итог — на /payment/result.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import type { CheckoutSession } from '@/stores/payments'
import AppHeader from '@/components/AppHeader.vue'
import BIcon from '@/components/BIcon.vue'

const SCRIPT_SRC = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js'

const route = useRoute()
const router = useRouter()
const langStore = useLangStore()

const paymentId = String(route.params.id)
const session = ref<CheckoutSession | null>(null)
const loading = ref(true)
const failed = ref(false)
let widget: { destroy?: () => void } | null = null

const TITLES: Record<string, () => string> = {
  topup: () => langStore.t.checkoutTopup,
  donation: () => langStore.t.supportProject,
  subscription: () => langStore.t.checkoutSubscription,
  card_binding: () => langStore.t.checkoutCardBinding,
}
const title = computed(() => TITLES[session.value?.title ?? '']?.() ?? '')

function loadScript(): Promise<void> {
  if ((window as any).YooMoneyCheckoutWidget) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error('widget script'))
    document.head.appendChild(el)
  })
}

onMounted(async () => {
  try {
    const raw = sessionStorage.getItem(`checkout:${paymentId}`)
    session.value = raw ? JSON.parse(raw) : null
  } catch { session.value = null }
  // Сессии нет (обновили вкладку в другом браузере и т.п.) — проверим статус платежа
  if (!session.value?.token) { router.replace({ name: 'payment-result', query: { id: paymentId } }); return }

  try {
    await loadScript()
    const Widget = (window as any).YooMoneyCheckoutWidget
    widget = new Widget({
      confirmation_token: session.value.token,
      return_url: session.value.returnUrl,
      customization: {
        colors: { control_primary: '#4C67CF', control_primary_content: '#FFFFFF', background: '#FFFFFF' },
      },
      error_callback: () => { failed.value = true },
    })
    await (widget as any).render('yk-widget')
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
onUnmounted(() => { try { widget?.destroy?.() } catch { /* уже уничтожен */ } })
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />
    <main class="max-w-lg mx-auto px-4 pt-24 pb-16">
      <div class="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-card shadow-2xl">
        <!-- Шапка с суммой -->
        <div class="relative px-6 pt-7 pb-6 bg-gradient-to-br from-brand-accent/25 via-brand-accent-plus/15 to-transparent">
          <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-accent">
            <BIcon name="ShieldCheck" class="w-4 h-4" /> {{ langStore.t.checkoutSecure }}
          </div>
          <h1 class="mt-3 text-lg font-bold text-white/80">{{ title }}</h1>
          <p v-if="session" class="mt-1 text-4xl font-extrabold leading-none">{{ session.amount }} <span class="text-2xl text-white/60">₽</span></p>
        </div>

        <!-- Виджет ЮKassa -->
        <div class="px-4 pb-4 sm:px-6 sm:pb-6">
          <div class="rounded-2xl bg-white p-3 sm:p-4 min-h-[280px] relative">
            <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
              <span class="w-9 h-9 border-2 border-slate-200 border-t-brand-accent rounded-full animate-spin" />
            </div>
            <div id="yk-widget" />
            <div v-if="failed" class="py-10 text-center space-y-3">
              <BIcon name="AlertTriangle" class="w-10 h-10 mx-auto text-amber-500" />
              <p class="text-sm font-semibold text-slate-700">{{ langStore.t.checkoutLoadError }}</p>
              <RouterLink :to="{ name: 'payment-result', query: { id: paymentId } }" class="inline-block text-sm font-bold text-brand-accent underline">
                {{ langStore.t.checkoutCheckStatus }}
              </RouterLink>
            </div>
          </div>
        </div>

        <div class="px-6 pb-6 flex items-center justify-between gap-3 text-[11px] text-white/40">
          <span class="flex items-center gap-1.5"><BIcon name="Lock" class="w-3.5 h-3.5" /> {{ langStore.t.checkoutNote }}</span>
          <button @click="router.back()" class="font-bold text-white/55 hover:text-white transition-colors">{{ langStore.t.cancel }}</button>
        </div>
      </div>
    </main>
  </div>
</template>
