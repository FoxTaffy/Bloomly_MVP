/** Способ оплаты, привязанный через ЮKassa (у нас — только маска, токен на сервере). */
export interface PaymentMethod {
  id: string
  type: 'bank_card' | 'yoo_money' | 'sbp' | string
  brand: string
  last4: string | null
  exp_month: number | null
  exp_year: number | null
  title: string | null
  is_default: boolean
  created_at: string
}
