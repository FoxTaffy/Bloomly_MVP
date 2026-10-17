import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'
import router from '../router'

export type PayMethod = 'AC' | 'PC' | 'wallet' // AC — карта, PC — кошелёк ЮMoney, wallet — баланс Blooms
export type BillingPeriod = 'month' | 'year'

export interface PlanQuote {
  tier: string
  period: BillingPeriod
  months: number
  perMonth: number
  amount: number
  bcAmount?: number
  discounted: boolean
}

export interface PaymentsConfig {
  enabled: boolean
  /** В ЮKassa подключены автоплатежи: можно привязать карту и включить автопродление */
  recurring: boolean
  provider: string
  methods: PayMethod[]
  bcRate: number
  topup: { min: number; max: number; step: number; packages: { bc: number; rub: number; popular?: boolean }[] }
  donate: { min: number; max: number }
  plans: { tier: string; month: PlanQuote; year: PlanQuote }[]
  subscription: { tier: string; expiresAt: string | null; period: BillingPeriod | null; autoRenew: boolean }
  /** Есть привязанная через ЮKassa карта/кошелёк — по нему идёт автопродление */
  hasSavedMethod: boolean
}

export interface PaymentInfo {
  id: string
  provider: 'yookassa' | 'wallet'
  purpose: 'wallet_topup' | 'subscription' | 'donation' | 'card_binding'
  status: 'pending' | 'succeeded' | 'expired' | 'review' | 'refunded'
  amount: string
  bc: number | null
  currency: string
  method: string | null
  tier: string | null
  period: BillingPeriod | null
  recurring: boolean
  paid_at: string | null
  created_at: string
}

export interface CheckoutSession {
  token: string
  returnUrl: string
  amount: number
  title: string
}

/** Открывает нашу страницу оплаты с виджетом ЮKassa; после оплаты виджет вернёт на /payment/result?id=… */
function openCheckout(paymentId: string, session: CheckoutSession) {
  try { sessionStorage.setItem(`checkout:${paymentId}`, JSON.stringify(session)) } catch { /* приватный режим */ }
  return router.push({ name: 'checkout', params: { id: paymentId } })
}

export const usePaymentsStore = defineStore('payments', () => {
  const config = ref<PaymentsConfig | null>(null)

  async function fetchConfig() {
    const { data } = await api.get('/payments/config')
    config.value = data.data
    return config.value!
  }

  async function quote(tier: string, period: BillingPeriod): Promise<PlanQuote> {
    const { data } = await api.get('/payments/subscription/quote', { params: { tier, period } })
    return data.data
  }

  async function startTopup(amount: number, method: 'AC' | 'PC') {
    const { data } = await api.post('/payments/topup', { amount, method })
    await openCheckout(data.data.paymentId, { token: data.data.token, returnUrl: data.data.returnUrl, amount, title: 'topup' })
  }

  async function startDonation(amount: number, method: 'AC' | 'PC') {
    const { data } = await api.post('/payments/donate', { amount, method })
    await openCheckout(data.data.paymentId, { token: data.data.token, returnUrl: data.data.returnUrl, amount, title: 'donation' })
  }

  /** Привязка карты/ЮMoney: проверочный 1 ₽ в виджете ЮKassa, потом возврат. */
  async function startCardBinding() {
    const { data } = await api.post('/payments/card-binding')
    await openCheckout(data.data.paymentId, { token: data.data.token, returnUrl: data.data.returnUrl, amount: data.data.amount, title: 'card_binding' })
  }

  async function setAutoRenew(enabled: boolean) {
    await api.patch('/payments/auto-renew', { enabled })
    if (config.value) config.value.subscription.autoRenew = enabled
  }

  /** Для wallet возвращает результат сразу; для шлюза — уводит на оплату и не возвращается. */
  async function startSubscription(tier: string, period: BillingPeriod, method: PayMethod, autoRenew = false) {
    const { data } = await api.post('/payments/subscription', { tier, period, method, autoRenew })
    const res = data.data as { paymentId: string; status: 'pending' | 'succeeded'; amount: number; token?: string; returnUrl?: string; subscription?: { tier: string; expiresAt: string } }
    if (res.token && res.returnUrl) await openCheckout(res.paymentId, { token: res.token, returnUrl: res.returnUrl, amount: res.amount, title: 'subscription' })
    return res
  }

  async function getPayment(id: string): Promise<PaymentInfo> {
    const { data } = await api.get(`/payments/${id}`)
    return data.data
  }

  async function devConfirm(id: string): Promise<PaymentInfo> {
    const { data } = await api.post(`/payments/${id}/dev-confirm`)
    return data.data
  }

  return { config, fetchConfig, quote, startTopup, startDonation, startSubscription, startCardBinding, setAutoRenew, getPayment, devConfirm }
})
