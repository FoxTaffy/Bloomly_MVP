<script setup lang="ts">
import { computed } from 'vue'
import { useLangStore } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'

const cardNum  = defineModel<string>('cardNum', { default: '' })
const cardExp  = defineModel<string>('cardExp', { default: '' })
const cardCvv  = defineModel<string>('cardCvv', { default: '' })
const cardName = defineModel<string>('cardName', { default: '' })
const flipped  = defineModel<boolean>('flipped', { default: false })

const langStore = useLangStore()

const maskedNumber = computed(() => {
  const raw = cardNum.value.replace(/\s/g, '')
  const padded = (raw + '••••••••••••••••').slice(0, 16)
  return padded.match(/.{1,4}/g)!.join(' ')
})

function formatCardNum(e: Event) {
  const input = e.target as HTMLInputElement
  const raw = input.value.replace(/\D/g, '').slice(0, 16)
  cardNum.value = raw.replace(/(.{4})/g, '$1 ').trim()
}

function formatExp(e: Event) {
  const input = e.target as HTMLInputElement
  const raw = input.value.replace(/\D/g, '').slice(0, 4)
  cardExp.value = raw.length > 2 ? raw.slice(0, 2) + '/' + raw.slice(2) : raw
}

function formatName(e: Event) {
  const input = e.target as HTMLInputElement
  cardName.value = input.value.toUpperCase().replace(/[^A-ZА-ЯЁ\s'-]/g, '').slice(0, 26)
}

function formatCvv(e: Event) {
  const input = e.target as HTMLInputElement
  cardCvv.value = input.value.replace(/\D/g, '').slice(0, 4)
}
</script>

<template>
  <div>
    <!-- 3D flip card -->
    <div class="card-scene">
      <div class="card-inner" :class="{ 'is-flipped': flipped }">
        <!-- Front -->
        <div class="card-face card-front">
          <span class="card-shine" />
          <div class="flex items-start justify-between">
            <BIcon name="CreditCard" class="w-6 h-6 text-white/85" />
            <BIcon name="Sparkles" class="w-5 h-5 text-white/60" />
          </div>
          <div>
            <p class="font-mono text-lg tracking-[0.15em] text-white/95 mb-4">{{ maskedNumber }}</p>
            <div class="flex items-end justify-between">
              <div class="min-w-0">
                <p class="text-[8px] text-white/50 uppercase tracking-wider mb-0.5">{{ langStore.t.payModalNameLabel }}</p>
                <p class="text-xs font-bold text-white/90 uppercase tracking-wide truncate">{{ cardName || langStore.t.payModalNamePlaceholder }}</p>
              </div>
              <div class="flex-shrink-0 ml-2">
                <p class="text-[8px] text-white/50 uppercase tracking-wider mb-0.5">{{ langStore.t.payModalExpiry }}</p>
                <p class="text-xs font-bold text-white/90 font-mono">{{ cardExp || 'MM/YY' }}</p>
              </div>
            </div>
          </div>
        </div>
        <!-- Back -->
        <div class="card-face card-back">
          <div class="h-10 bg-black/70 mt-6" />
          <div class="px-5 mt-5">
            <div class="bg-white/90 rounded-md h-8 flex items-center justify-end px-3">
              <span class="font-mono text-sm tracking-widest text-black/70 italic">{{ cardCvv ? cardCvv.padEnd(3, '•') : '•••' }}</span>
            </div>
            <p class="text-[8px] text-white/45 uppercase tracking-wider mt-3 text-right">{{ langStore.t.payModalCvvLabel }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Inputs -->
    <div class="space-y-3 mt-5">
      <input
        type="text" inputmode="numeric" maxlength="19"
        :placeholder="langStore.t.payModalCardNumber"
        :value="cardNum" @input="formatCardNum"
        class="pay-input" />
      <div class="grid grid-cols-2 gap-3">
        <input
          type="text" inputmode="numeric" maxlength="5"
          :placeholder="langStore.t.payModalExpiry"
          :value="cardExp" @input="formatExp"
          class="pay-input" />
        <input
          type="password" inputmode="numeric" maxlength="4"
          :placeholder="langStore.t.payModalCvvLabel"
          :value="cardCvv" @input="formatCvv"
          @focus="flipped = true" @blur="flipped = false"
          class="pay-input" />
      </div>
      <input
        type="text" maxlength="26"
        :placeholder="langStore.t.payModalNameLabel"
        :value="cardName" @input="formatName"
        class="pay-input" />
    </div>
  </div>
</template>

<style scoped>
.pay-input {
  width: 100%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 14px 16px;
  color: white;
  font-size: 0.875rem;
  font-family: ui-monospace, monospace;
  outline: none;
  transition: all 0.15s;
}
.pay-input::placeholder { color: rgba(255,255,255,0.2); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
.pay-input:focus { border-color: rgba(76,103,207,0.5); box-shadow: 0 0 0 3px rgba(76,103,207,0.15); background: rgba(255,255,255,0.07); }
.pay-input:-webkit-autofill,
.pay-input:-webkit-autofill:hover,
.pay-input:-webkit-autofill:focus {
  -webkit-text-fill-color: white;
  -webkit-box-shadow: 0 0 0 1000px rgba(30,30,40,0.9) inset;
  transition: background-color 9999s ease-in-out 0s;
}

/* 3D flip card */
.card-scene { perspective: 1200px; height: 176px; }
.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s cubic-bezier(0.34, 1.1, 0.4, 1);
  transform-style: preserve-3d;
}
.card-inner.is-flipped { transform: rotateY(180deg); }
.card-face {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  box-shadow: 0 10px 30px rgba(76,103,207,0.35);
  background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%);
}
.card-front {
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.card-back {
  transform: rotateY(180deg);
  padding-bottom: 16px;
}

.card-shine {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}
.card-shine::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -60%;
  width: 40%;
  height: 200%;
  background: linear-gradient(75deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%);
  transform: rotate(8deg);
  animation: card-shine-sweep 2.6s ease-in-out 0.5s 1;
}
@keyframes card-shine-sweep {
  0%   { left: -60%; }
  100% { left: 130%; }
}
</style>
