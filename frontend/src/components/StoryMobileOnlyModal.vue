<script setup lang="ts">
import { ref, onMounted } from 'vue'
import QRCode from 'qrcode'
import BIcon from './BIcon.vue'

defineEmits<{ (e: 'close'): void }>()

// The mobile app isn't published yet — the QR points at the website itself
// as a temporary placeholder until Google Play / App Store links exist.
const QR_TARGET = 'https://bloomly.fun'
const qrDataUrl = ref('')

onMounted(async () => {
  try {
    qrDataUrl.value = await QRCode.toDataURL(QR_TARGET, {
      width: 176,
      margin: 1,
      color: { dark: '#0b0f1a', light: '#ffffff' },
    })
  } catch {}
})
</script>

<template>
  <Transition name="fade">
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      @click.self="$emit('close')"
    >
      <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center relative">
        <button
          class="absolute top-3 right-3 w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          @click="$emit('close')"
        >
          <BIcon name="X" class="w-4 h-4" />
        </button>

        <div class="w-14 h-14 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center mx-auto mb-4">
          <BIcon name="Smartphone" class="w-7 h-7 text-brand-accent" />
        </div>

        <h3 class="text-lg font-extrabold text-white mb-2">Публикация историй — только в приложении</h3>
        <p class="text-sm text-white/60 leading-relaxed mb-4">
          Чтобы истории выглядели и работали как надо (камера, видео, стикеры), публиковать их можно только из мобильного приложения Bloomly.
        </p>

        <div class="w-[176px] h-[176px] mx-auto rounded-2xl overflow-hidden border border-brand-border bg-white flex items-center justify-center mb-4">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR-код Bloomly" class="w-full h-full" />
          <div v-else class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
        </div>

        <div class="flex items-center justify-center gap-2 mb-4">
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-brand-border text-xs font-semibold text-white/40">
            <BIcon name="PlayCircle" class="w-3.5 h-3.5" /> Google Play · скоро
          </span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-brand-border text-xs font-semibold text-white/40">
            <BIcon name="Apple" class="w-3.5 h-3.5" /> App Store · скоро
          </span>
        </div>

        <p class="text-xs text-white/35 leading-relaxed">
          Приложение пока в разработке и ещё не опубликовано в магазинах — извините за временное неудобство. QR-код пока ведёт на сайт Bloomly.
        </p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
