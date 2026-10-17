export interface PaymentMethod {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  holder_name: string
  is_default: boolean
  created_at: string
}
