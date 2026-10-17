<template>
  <Teleport to="body">
    <Transition name="ad-req-backdrop">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-300 flex items-end sm:items-center justify-center sm:p-4"
        @click.self="close"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-xs" @click="close" />

        <Transition name="ad-req-panel">
          <div
            v-if="modelValue"
            class="relative w-full sm:max-w-sm bg-[#13131f] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          >
            <div class="sm:hidden flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 rounded-full bg-white/15" />
            </div>

            <div class="flex items-center justify-between px-5 py-4 border-b border-white/6">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center">
                  <BIcon name="Megaphone" class="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <h3 class="text-sm font-extrabold text-white leading-none">Заявка на рекламу</h3>
                  <p class="text-[11px] text-white/35 mt-0.5">Рассмотрим и разместим вручную</p>
                </div>
              </div>
              <button
                @click="close"
                class="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
              >
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <Transition name="fade" mode="out-in">
              <!-- Success -->
              <div v-if="sent" key="success" class="p-8 text-center">
                <div class="relative w-16 h-16 mx-auto mb-4">
                  <div class="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style="animation-duration:1.5s" />
                  <div class="relative w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <BIcon name="CheckCircle2" class="w-8 h-8 text-emerald-400" />
                  </div>
                </div>
                <h4 class="text-white font-extrabold text-base mb-1">Заявка отправлена</h4>
                <p class="text-white/40 text-sm">Мы свяжемся с вами после модерации</p>
              </div>

              <!-- Logged out -->
              <div v-else-if="!auth.isAuthenticated" key="guest" class="p-8 text-center">
                <BIcon name="Lock" class="w-10 h-10 text-white/20 mx-auto mb-3" />
                <h4 class="text-white font-extrabold text-base mb-1">Войдите в аккаунт</h4>
                <p class="text-white/40 text-sm">Чтобы оставить заявку на размещение рекламы, нужно войти</p>
              </div>

              <!-- Form -->
              <div v-else key="form" class="p-4 stack-y-3 max-h-[70vh] overflow-y-auto overscroll-contain">
                <div class="bg-white/3 border border-white/8 rounded-2xl px-3.5 py-2.5">
                  <p class="text-[10px] font-bold text-white/30 uppercase tracking-wide mb-1.5">Ориентировочные цены</p>
                  <div class="text-[11px] text-white/50 stack-y-0.5">
                    <p>Верх ленты — от 1500 ₽ / нед.</p>
                    <p>Страница «Группы» — от 1200 ₽ / нед.</p>
                    <p>Левое меню — от 800 ₽ / нед.</p>
                    <p>Правая колонка — от 600 ₽ / нед.</p>
                  </div>
                  <p class="text-[10px] text-white/25 mt-1.5">Точную стоимость и место размещения обсудим после заявки</p>
                </div>

                <input
                  v-model="title"
                  class="ad-req-input"
                  placeholder="Название / заголовок объявления *"
                  maxlength="120"
                />
                <textarea
                  v-model="description"
                  class="ad-req-input resize-none"
                  rows="3"
                  placeholder="Краткое описание (необязательно)"
                  maxlength="400"
                />
                <input
                  v-model="linkUrl"
                  class="ad-req-input"
                  placeholder="Ссылка (https://…) *"
                />
                <input
                  v-model="contactInfo"
                  class="ad-req-input"
                  placeholder="Как с вами связаться (Telegram, e-mail…)"
                  maxlength="200"
                />
                <input
                  v-model="priceLabel"
                  class="ad-req-input"
                  placeholder="Ваш бюджет / готовы платить (необязательно)"
                  maxlength="60"
                />

                <div v-if="imageUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/8 rounded-2xl">
                  <img :src="imageUrl" class="w-16 h-12 object-cover rounded-xl shrink-0 border border-white/10" />
                  <p class="text-[10px] text-white/30 truncate flex-1">{{ imageUrl }}</p>
                  <button type="button" @click="imageUrl = ''"
                    class="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center shrink-0 transition-colors">
                    <BIcon name="X" class="w-3.5 h-3.5" />
                  </button>
                </div>
                <MediaUpload v-else type="banners" accept="image/*" @uploaded="(urls) => imageUrl = urls[0] ?? ''" />

                <p v-if="errorMsg" class="text-rose-400 text-xs font-semibold px-1">{{ errorMsg }}</p>

                <div class="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    @click="close"
                    class="flex-1 py-3 rounded-2xl border border-white/8 text-white/40 text-sm font-bold hover:bg-white/5 hover:text-white/60 transition-all"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    @click="submit"
                    :disabled="!title.trim() || !linkUrl.trim() || isSending"
                    class="flex-2 flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-extrabold disabled:opacity-30 transition-all hover:opacity-90 active:scale-[0.98]"
                    style="background: linear-gradient(135deg, #FF6B9D, #7c3aed)"
                  >
                    <span v-if="isSending" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <BIcon v-else name="Send" class="w-4 h-4" />
                    {{ isSending ? 'Отправка…' : 'Отправить заявку' }}
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import BIcon from '../BIcon.vue'
import MediaUpload from '../MediaUpload.vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', val: boolean): void }>()

const auth = useAuthStore()

const title = ref('')
const description = ref('')
const linkUrl = ref('')
const contactInfo = ref('')
const priceLabel = ref('')
const imageUrl = ref('')
const sent = ref(false)
const isSending = ref(false)
const errorMsg = ref('')

watch(() => props.modelValue, (v) => {
  if (!v) {
    setTimeout(() => {
      title.value = ''
      description.value = ''
      linkUrl.value = ''
      contactInfo.value = ''
      priceLabel.value = ''
      imageUrl.value = ''
      sent.value = false
      errorMsg.value = ''
    }, 300)
  }
})

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  if (!title.value.trim() || !linkUrl.value.trim() || isSending.value) return
  isSending.value = true
  errorMsg.value = ''
  try {
    await api.post('/admin/ads', {
      title: title.value.trim(),
      description: description.value.trim() || undefined,
      imageUrl: imageUrl.value || undefined,
      linkUrl: linkUrl.value.trim(),
      contactInfo: contactInfo.value.trim() || undefined,
      priceLabel: priceLabel.value.trim() || undefined,
    })
    sent.value = true
    setTimeout(() => close(), 2800)
  } catch {
    errorMsg.value = 'Не удалось отправить заявку. Попробуйте позже.'
  } finally {
    isSending.value = false
  }
}
</script>

<style scoped>
.ad-req-input {
  width: 100%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 1rem;
  padding: 0.75rem 1rem;
  color: white;
  font-size: 0.875rem;
  outline: none;
  transition: all 0.15s ease;
}
.ad-req-input::placeholder { color: rgba(255,255,255,0.2); }
.ad-req-input:focus { border-color: rgba(255,107,157,0.4); background: rgba(255,255,255,0.06); }

.ad-req-backdrop-enter-active,
.ad-req-backdrop-leave-active { transition: opacity 0.25s ease; }
.ad-req-backdrop-enter-from,
.ad-req-backdrop-leave-to { opacity: 0; }

.ad-req-panel-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.ad-req-panel-leave-active { transition: all 0.2s ease; }
.ad-req-panel-enter-from { opacity: 0; transform: translateY(24px) scale(0.96); }
.ad-req-panel-leave-to { opacity: 0; transform: translateY(12px) scale(0.98); }

@media (max-width: 639px) {
  .ad-req-panel-enter-from { transform: translateY(100%); }
  .ad-req-panel-leave-to { transform: translateY(100%); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
