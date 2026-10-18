<template>
  <Teleport to="body">
  <div v-if="modelValue" class="fixed inset-0 z-999 flex items-center justify-center p-4" @click.self="close">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-xs" />
    <div class="relative bg-brand-card border border-brand-border rounded-3xl p-6 max-w-lg w-full shadow-2xl z-10 max-h-[90vh] overflow-y-auto" style="overscroll-behavior: contain;">
      <button @click="close" class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors z-20">
        <BIcon name="X" class="w-4 h-4 text-white/50" />
      </button>
      <h2 class="text-xl font-extrabold text-white mb-4">{{ langStore.t.avatarFrameSubmitTitle }}</h2>

      <div class="stack-y-4">
        <div>
          <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.avatarFrameImageLabel }}</label>
          <MediaUpload folder="avatar-frames" accept="image/png" @uploaded="(urls: string[]) => { imageUrl = urls[0] ?? '' }" />
        </div>

        <div v-if="imageUrl">
          <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.avatarFramePreviewLabel }}</label>
          <FrameEditor :avatar-url="auth.avatarUrl || '/icons/badges/NN.jpg'" :frame-image-url="imageUrl" v-model="calibration" />
        </div>

        <div>
          <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">
            {{ langStore.t.avatarFrameNameLabel }} <span class="text-brand-accent normal-case font-normal">*</span>
          </label>
          <input v-model="name" maxlength="120"
            class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-brand-accent/50 transition-all" />
        </div>

        <div>
          <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.avatarFramePriceLabel }}</label>
          <div class="relative">
            <input v-model.number="price" type="number" min="0" step="0.01" placeholder="0.00"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 pr-16 text-sm text-white placeholder-white/20 outline-hidden focus:border-brand-accent/50 transition-all" />
            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-bold">{{ price === 0 ? 'FREE' : 'USD' }}</span>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">
            {{ langStore.t.dealersDenTagsLabel }} <span class="normal-case font-normal text-white/20">{{ langStore.t.dealersDenTagsHint }}</span>
          </label>
          <input v-model="tags" :placeholder="langStore.t.dealersDenTagsPlaceholder"
            class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-brand-accent/50 transition-all" />
        </div>

        <p v-if="error" class="text-xs text-red-400">{{ error }}</p>

        <button type="button" :disabled="!canSubmit || submitting" @click="submit"
          class="w-full flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
          <span v-if="submitting" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          {{ langStore.t.avatarFrameSubmitAction }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useLangStore } from '@/stores/lang'
import { useAuthStore } from '@/stores/auth'
import { useDealersDenStore } from '@/stores/dealersDen'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import FrameEditor, { type FrameCalibration } from '@/components/FrameEditor.vue'

const langStore = useLangStore()
const auth = useAuthStore()
const store = useDealersDenStore()

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'created'): void }>()

const imageUrl = ref('')
const name = ref('')
const price = ref(0)
const tags = ref('')
const calibration = ref<FrameCalibration>({ offsetX: 0, offsetY: 0, scale: 1, rotation: 0 })
const submitting = ref(false)
const error = ref('')

const canSubmit = computed(() => !!imageUrl.value && name.value.trim().length > 0)

function resetForm() {
  imageUrl.value = ''
  name.value = ''
  price.value = 0
  tags.value = ''
  calibration.value = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 }
  error.value = ''
}

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = ''
  try {
    await store.createAvatarFrame({
      name: name.value.trim(),
      imageUrl: imageUrl.value,
      price: price.value,
      tags: tags.value.split(',').map(t => t.trim()).filter(Boolean),
      defaultOffsetX: calibration.value.offsetX,
      defaultOffsetY: calibration.value.offsetY,
      defaultScale: calibration.value.scale,
      defaultRotation: calibration.value.rotation,
    })
    emit('created')
    close()
    resetForm()
  } catch (err: any) {
    error.value = err?.response?.data?.error ?? langStore.t.avatarFrameSubmitFailed
  } finally {
    submitting.value = false
  }
}
</script>
