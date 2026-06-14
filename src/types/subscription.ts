export interface Plan {
  id: string
  label: string
  durationDays: number
  amount: number
  currency: string
}

export interface SubscriptionInfo {
  plan: string
  planLabel: string
  status: 'active' | 'expired' | 'pending' | 'cancelled'
  expiresAt: string
  daysLeft: number
}

export interface SubscriptionStatusResponse {
  active: boolean
  subscription: SubscriptionInfo | null
  plans: Plan[]
}

export interface CreatePaymentResponse {
  paymentId: string
  confirmationUrl: string
  plan: {
    id: string
    label: string
    amount: number
    currency: string
  }
}

export interface ApiError {
  code: string
  message: string
}
