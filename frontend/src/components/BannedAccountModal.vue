<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import BIcon from './BIcon.vue'

const props = defineProps<{
  show: boolean
  reason: string
  email: string
  password: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const auth = useAuthStore()
const downloading = ref(false)
const downloadError = ref('')
const downloaded = ref(false)

const supportHref = () => {
  const subject = encodeURIComponent('Апелляция блокировки аккаунта')
  const body = encodeURIComponent(`Аккаунт: ${props.email}\nПричина блокировки: ${props.reason}\n\nОпиши, почему считаешь блокировку ошибочной:\n`)
  return `mailto:support@bloomly.fun?subject=${subject}&body=${body}`
}

async function downloadData() {
  downloading.value = true
  downloadError.value = ''
  try {
    const data = await auth.exportData(props.email, props.password)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bloomly-data-${props.email}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    downloaded.value = true
  } catch (e: any) {
    downloadError.value = e?.response?.data?.error?.message || 'Не удалось скачать данные'
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-250 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4" style="background:rgba(5,8,20,0.72);backdrop-filter:blur(6px)">
      <Transition
        appear
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 scale-95 translate-y-4"
        enter-to-class="opacity-100 scale-100 translate-y-0"
      >
        <div class="w-full max-w-[420px] rounded-[28px] overflow-hidden relative"
          style="background:rgba(12,15,32,0.92);border:1px solid rgba(244,63,94,0.3);box-shadow:0 32px 64px rgba(0,0,0,0.55),0 0 0 1px rgba(244,63,94,0.12)">

          <!-- Red banner -->
          <div class="relative px-8 pt-8 pb-6 text-center" style="background:linear-gradient(160deg,#be123c 0%,#e11d48 55%,#f43f5e 100%)">
            <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center backdrop-blur-sm">
              <BIcon name="CircleAlert" class="w-8 h-8 text-white" />
            </div>
            <h2 class="text-xl font-black text-white">Ваш аккаунт заблокирован</h2>
          </div>

          <div class="p-7 space-y-3.5">
            <p v-if="reason" class="text-sm text-white/50 leading-relaxed">{{ reason }}</p>
            <p class="text-sm text-white/50 leading-relaxed">Если это произошло по ошибке, вы можете подать жалобу.</p>

            <!-- Подать апелляцию -->
            <a :href="supportHref()"
              class="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white transition-all"
              style="background:linear-gradient(135deg,#e11d48,#f43f5e);box-shadow:0 8px 24px rgba(225,29,72,0.35)">
              <BIcon name="Mail" class="w-4 h-4" />
              Подать апелляцию
            </a>

            <!-- Скачать данные -->
            <button @click="downloadData" :disabled="downloading"
              class="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all disabled:opacity-50"
              style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.8)">
              <BIcon name="Download" class="w-4 h-4" />
              {{ downloading ? 'Готовим файл…' : downloaded ? 'Скачано ✓' : 'Скачать свои данные' }}
            </button>
            <p v-if="downloadError" class="text-xs text-rose-400 font-semibold text-center">{{ downloadError }}</p>

            <button @click="emit('close')" class="w-full text-center text-xs text-white/25 hover:text-white/50 transition-colors pt-1">
              Закрыть
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
