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
          <!-- Header -->
          <div class="flex items-center gap-3 mb-5 pr-10">
            <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
              style="background: linear-gradient(135deg, #4C67CF, #7c3aed)">
              <BIcon name="Send" class="w-5 h-5 text-white" />
            </div>
            <div class="min-w-0">
              <h2 class="text-xl font-extrabold text-white leading-tight">Отправить заявку</h2>
              <p class="text-white/40 text-xs">Продавец ответит вам в личных сообщениях</p>
            </div>
          </div>

          <div class="stack-y-5">
            <!-- Lot summary -->
            <div class="relative overflow-hidden rounded-2xl border border-brand-border bg-brand-bg/50 p-3 flex items-center gap-3.5">
              <div class="absolute inset-0 pointer-events-none opacity-70"
                style="background: radial-gradient(120% 140% at 0% 0%, rgba(124,58,237,0.14), transparent 60%)" />
              <div class="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-black/30 border border-white/8 flex items-center justify-center">
                <img v-if="listing.images[0] && !hidePreview" :src="listing.images[0]" class="w-full h-full object-cover" />
                <BIcon v-else :name="hidePreview ? 'EyeOff' : 'Image'" class="w-6 h-6 text-white/25" />
              </div>
              <div class="relative min-w-0 flex-1">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-0.5">Лот</p>
                <p class="text-sm font-extrabold text-white truncate">{{ listing.title }}</p>
                <p class="text-base font-black text-brand-yellow tabular-nums leading-tight">{{ formatPrice(listing.price, listing.currency) }}</p>
              </div>
            </div>

            <!-- Message -->
            <div class="stack-y-2">
              <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center justify-between">
                <span>Сообщение <span class="text-brand-accent">*</span></span>
                <span class="normal-case tracking-normal font-medium text-white/25 tabular-nums">{{ text.length }}/1000</span>
              </label>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="t in templates" :key="t" type="button" @click="text = t"
                  class="text-[11px] font-bold px-3 py-1 rounded-full border border-brand-border bg-white/4 text-white/60 hover:text-white hover:border-brand-accent/50 transition-colors">
                  {{ t.split('.')[0] }}
                </button>
              </div>
              <textarea v-model="text" rows="4" maxlength="1000" placeholder="Опишите, что вас интересует…"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm placeholder-white/25 focus:border-brand-accent focus:outline-hidden resize-none transition-colors" />
            </div>

            <!-- Contact -->
            <div class="stack-y-2">
              <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest block">
                Контакты для связи <span class="normal-case tracking-normal font-medium text-white/25">· необязательно</span>
              </label>
              <div class="relative">
                <BIcon name="AtSign" class="w-4 h-4 text-white/30 absolute left-4 top-1/2 -translate-y-1/2" />
                <input v-model="contact" maxlength="120" placeholder="Telegram, Discord…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl pl-11 pr-4 py-3 text-white text-sm placeholder-white/25 focus:border-brand-accent focus:outline-hidden transition-colors" />
              </div>
            </div>

            <p v-if="error" class="text-xs text-brand-error bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ error }}</p>
          </div>

          <div class="flex gap-3 mt-6">
            <button class="px-5 py-3.5 rounded-2xl bg-brand-bg border border-brand-border text-white/60 font-bold text-sm hover:bg-brand-border/50 transition-colors"
              @click="emit('close')">Отмена</button>
            <button class="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-extrabold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
              style="background: linear-gradient(135deg, #4C67CF, #7c3aed)"
              :disabled="!text.trim() || sending" @click="submit">
              <span v-if="sending" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <BIcon v-else name="Send" class="w-4 h-4" />
              {{ sending ? 'Отправляем…' : 'Отправить заявку' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useNsfwMode } from '@/composables/useNsfwMode'
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

const nsfw = useNsfwMode().nsfwEnabled
const hidePreview = computed(() => props.listing.is_nsfw && !nsfw.value)
const templates = ['Хочу купить. Расскажите, как оформить?', 'Есть вопрос по лоту.', 'Можно обсудить цену?']

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
