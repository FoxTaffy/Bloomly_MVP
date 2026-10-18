<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-999 flex items-center justify-center p-4" @click.self="emit('close')">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-xs" />
      <div class="relative bg-brand-card border border-brand-border rounded-3xl p-6 max-w-lg w-full shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
        <button class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors z-20"
          @click="emit('close')">
          <BIcon name="X" class="w-4 h-4 text-white/50" />
        </button>

        <!-- Sent -->
        <div v-if="sentConvId" class="text-center py-6 stack-y-3">
          <div class="w-14 h-14 rounded-full bg-brand-success/15 flex items-center justify-center mx-auto">
            <BIcon name="CheckCircle2" class="w-8 h-8 text-brand-success" />
          </div>
          <h2 class="text-xl font-extrabold text-white">Заявка отправлена</h2>
          <p class="text-white/40 text-xs">Продавец увидит её в личных сообщениях и ответит в чате.</p>
          <div class="flex gap-3 pt-2">
            <button class="flex-1 px-5 py-3 rounded-2xl bg-brand-bg border border-brand-border text-white/60 font-bold text-sm hover:bg-brand-border/50 transition-colors"
              @click="emit('close')">Закрыть</button>
            <button class="flex-1 py-3 rounded-2xl bg-brand-accent text-white font-bold text-sm hover:bg-brand-accent-plus transition-colors shadow-accent"
              @click="router.push({ name: 'messages', query: { userId: sellerId } })">
              <BIcon name="MessageCircle" class="w-4 h-4 inline mr-1.5 -mt-0.5" /> Открыть чат
            </button>
          </div>
        </div>

        <template v-else>
          <h2 class="text-xl font-extrabold text-white mb-1">Отправить заявку</h2>
          <p class="text-white/40 text-xs mb-5">Расскажите продавцу, что вас интересует</p>

          <div class="stack-y-4">
            <!-- Lot summary -->
            <div class="bg-brand-bg/40 border border-brand-border rounded-2xl p-3 flex items-center gap-3">
              <img v-if="listing.images[0]" :src="listing.images[0]" class="w-12 h-12 rounded-xl object-cover shrink-0"
                :class="listing.is_nsfw ? 'blur-md' : ''" />
              <div v-else class="w-12 h-12 rounded-xl bg-brand-bg flex items-center justify-center shrink-0">
                <BIcon name="Image" class="w-5 h-5 text-white/20" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-white truncate">{{ listing.title }}</p>
                <p class="text-xs text-brand-yellow font-bold">{{ formatPrice(listing.price, listing.currency) }}</p>
              </div>
            </div>

            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">
                Сообщение <span class="text-brand-accent normal-case font-normal">*</span>
              </label>
              <textarea v-model="text" rows="4" maxlength="1000" placeholder="Здравствуйте! Хочу заказать…"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-hidden resize-none" />
              <p class="text-[10px] text-white/25 text-right mt-1">{{ text.length }}/1000</p>
            </div>

            <div>
              <label class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">
                Контакты для связи <span class="normal-case font-normal text-white/25">(необязательно)</span>
              </label>
              <input v-model="contact" maxlength="120" placeholder="Telegram, Discord…"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 focus:border-brand-accent focus:outline-hidden" />
            </div>

            <p v-if="error" class="text-xs text-brand-error bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ error }}</p>
          </div>

          <div class="flex gap-3 mt-6">
            <button class="px-5 py-3 rounded-2xl bg-brand-bg border border-brand-border text-white/60 font-bold text-sm hover:bg-brand-border/50 transition-colors"
              @click="emit('close')">Отмена</button>
            <button class="flex-1 py-3 rounded-2xl bg-brand-accent text-white font-bold text-sm hover:bg-brand-accent-plus transition-colors shadow-accent disabled:opacity-40"
              :disabled="!text.trim() || sending" @click="submit">
              <span v-if="sending" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin align-middle mr-1.5" />
              <BIcon v-else name="Send" class="w-4 h-4 inline mr-1.5 -mt-0.5" />
              {{ sending ? 'Отправляем…' : 'Отправить заявку' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useMessagesStore } from '@/stores/messages'
import api from '@/api'
import { errorMessage } from '@/lib/apiError'
import { formatPrice } from '@/lib/format'
import type { DealerListing } from '@/stores/dealersDen'

const props = defineProps<{ listing: DealerListing; sellerId: string }>()
const emit  = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const messages = useMessagesStore()

const text = ref('')
const contact = ref('')
const sending = ref(false)
const error = ref('')
const sentConvId = ref('')

async function submit() {
  if (!text.value.trim() || sending.value) return
  sending.value = true
  error.value = ''
  try {
    const convId = await messages.openConversation(props.sellerId)
    const lines = [
      `📩 Заявка на лот «${props.listing.title}» (${formatPrice(props.listing.price, props.listing.currency)})`,
      `${window.location.origin}/dealers-den/${props.listing.id}`,
      '',
      text.value.trim(),
    ]
    if (contact.value.trim()) lines.push('', `Контакты: ${contact.value.trim()}`)
    // Direct REST call (not store.sendMessage, which swallows failures) so errors reach the form.
    await api.post(`/messages/conversations/${convId}/messages`, { content: lines.join('\n') })
    sentConvId.value = convId
  } catch (e) {
    error.value = errorMessage(e) ?? 'Не удалось отправить заявку'
  } finally {
    sending.value = false
  }
}
</script>
