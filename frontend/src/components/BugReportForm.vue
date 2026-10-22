<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import api from '@/api'

const emit = defineEmits<{ (e: 'submitted', ticket: any): void; (e: 'cancel'): void; (e: 'error'): void }>()

const auth = useAuthStore()
const langStore = useLangStore()

const MAX_ATTACHMENT_FILES = 5

type Device = 'desktop' | 'mobile' | 'tablet'

// Устройство и браузер определяются автоматически, но пользователь может поправить их вручную
function detectDevice(): Device {
  const ua = navigator.userAgent
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet'
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile'
  return 'desktop'
}

function detectBrowser(): string {
  const ua = navigator.userAgent
  if (/YaBrowser/i.test(ua)) return 'Yandex Browser'
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet'
  if (/OPR\/|Opera/i.test(ua)) return 'Opera'
  if (/Edg(e|A|iOS)?\//i.test(ua)) return 'Microsoft Edge'
  if (/Firefox|FxiOS/i.test(ua)) return 'Mozilla Firefox'
  if (/Chrome|Chromium|CriOS/i.test(ua)) return 'Google Chrome / Chromium'
  if (/Safari/i.test(ua)) return 'Safari'
  return ''
}

const form = reactive({
  subject: '',
  message: '',
  steps_to_reproduce: '',
  expected_result: '',
  device: 'desktop' as Device,
  browser: '',
  contact_email: '',
  attachment_urls: [] as string[],
})
const isSubmitting = ref(false)
const mediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

onMounted(() => {
  form.device = detectDevice()
  form.browser = detectBrowser()
  form.contact_email = auth.user?.email ?? ''
})

async function submit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  try {
    const res = await api.post('/support/tickets', { type: 'bug', ...form })
    if (res.data.success) {
      emit('submitted', res.data.data.ticket)
      form.subject = form.message = form.steps_to_reproduce = form.expected_result = ''
      form.attachment_urls = []
      mediaUploadRef.value?.clearAll()
    }
  } catch {
    emit('error')
  } finally {
    isSubmitting.value = false
  }
}

const inputCls = 'w-full px-4 py-2.5 rounded-xl bg-brand-bg/60 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-hidden focus:border-brand-accent/50'
</script>

<template>
  <form @submit.prevent="submit" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-5 md:p-6">
    <h2 class="font-extrabold text-white text-xl leading-tight">{{ langStore.t.bugFormTitle }}</h2>
    <p class="text-xs text-brand-accent/70 mt-1 pb-4 mb-5 border-b border-white/8">{{ langStore.t.bugFormHint }}</p>

    <div class="mb-4">
      <label class="block text-xs font-bold text-white/70 mb-2">{{ langStore.t.bugTitleLabel }} <span class="text-brand-error">*</span></label>
      <input v-model="form.subject" type="text" required minlength="3" maxlength="150" :placeholder="langStore.t.bugTitlePlaceholder" :class="inputCls" />
    </div>

    <div class="mb-4">
      <label class="block text-xs font-bold text-white/70 mb-2">{{ langStore.t.bugWhatLabel }} <span class="text-brand-error">*</span></label>
      <textarea v-model="form.message" required minlength="10" rows="3" maxlength="3000" :placeholder="langStore.t.bugWhatPlaceholder" :class="inputCls + ' resize-none'"></textarea>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <div>
        <label class="block text-xs font-bold text-white/70 mb-2">{{ langStore.t.bugStepsLabel }} <span class="text-brand-error">*</span></label>
        <textarea v-model="form.steps_to_reproduce" required rows="3" maxlength="2000" :placeholder="langStore.t.bugStepsPlaceholder" :class="inputCls + ' resize-none font-mono text-xs'"></textarea>
      </div>
      <div>
        <label class="block text-xs font-bold text-white/70 mb-2">{{ langStore.t.bugExpectedLabel }} <span class="text-brand-error">*</span></label>
        <textarea v-model="form.expected_result" required rows="3" maxlength="1000" :placeholder="langStore.t.bugExpectedPlaceholder" :class="inputCls + ' resize-none'"></textarea>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <div>
        <label class="block text-xs font-bold text-white/70 mb-2">{{ langStore.t.bugDeviceLabel }}</label>
        <select v-model="form.device" :class="inputCls">
          <option value="desktop">{{ langStore.t.bugDeviceDesktop }}</option>
          <option value="mobile">{{ langStore.t.bugDeviceMobile }}</option>
          <option value="tablet">{{ langStore.t.bugDeviceTablet }}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-white/70 mb-2">{{ langStore.t.bugBrowserLabel }}</label>
        <input v-model="form.browser" type="text" maxlength="60" :class="inputCls" />
      </div>
    </div>

    <div class="mb-4">
      <label class="block text-xs font-bold text-white/70 mb-2">{{ langStore.t.helpAttachmentsLabel }}</label>
      <MediaUpload ref="mediaUploadRef" folder="reports" accept="image/*,video/*" :multiple="true" :max-files="MAX_ATTACHMENT_FILES" :max-size-mb="50" @uploaded="(urls: string[]) => form.attachment_urls = urls" />
    </div>

    <div class="mb-5">
      <label class="block text-xs font-bold text-white/70 mb-2">{{ langStore.t.helpEmailLabel }}</label>
      <input v-model="form.contact_email" type="email" placeholder="you@example.com" :class="inputCls" />
    </div>

    <div class="flex items-center justify-end gap-3">
      <button type="button" @click="emit('cancel')"
        class="px-5 py-2.5 rounded-xl text-sm font-bold bg-white/8 text-white/70 hover:text-white transition-all">
        {{ langStore.t.bugCancelBtn }}
      </button>
      <button type="submit" :disabled="isSubmitting"
        class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-brand-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all">
        <BIcon name="Send" class="w-4 h-4" />
        {{ isSubmitting ? langStore.t.helpSubmitting : langStore.t.bugSubmitBtn }}
      </button>
    </div>
  </form>
</template>
