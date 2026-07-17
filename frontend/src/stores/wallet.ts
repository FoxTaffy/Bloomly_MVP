import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useWalletStore = defineStore('wallet', () => {
  const balance = ref(0)
  const loading = ref(false)

  async function fetchBalance() {
    loading.value = true
    try {
      const { data } = await api.get('/wallet')
      balance.value = Number(data.data.balance)
      return balance.value
    } finally {
      loading.value = false
    }
  }

  async function topup(amount: number) {
    const { data } = await api.post('/wallet/topup', { amount })
    balance.value = Number(data.data.balance)
    return balance.value
  }

  return { balance, loading, fetchBalance, topup }
})
