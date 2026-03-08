<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('update:modelValue', false)" />

      <div class="relative w-full max-w-sm bg-[#1a1a2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 class="text-base font-bold text-white">Пожаловаться</h3>
          <button @click="$emit('update:modelValue', false)" class="text-white/40 hover:text-white rounded-full hover:bg-white/5 p-1.5 transition-colors">
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>

        <div class="p-5">
          <div v-if="!sent" class="space-y-3">
            <p class="text-sm text-white/50 mb-4">Выберите причину жалобы:</p>

            <label
              v-for="reason in reasons"
              :key="reason"
              class="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
              :class="selected === reason ? 'bg-white/5 ring-1 ring-red-500/40' : ''"
            >
              <input type="radio" :value="reason" v-model="selected" class="accent-red-500 w-4 h-4" />
              <span class="text-sm text-white">{{ reason }}</span>
            </label>

            <div v-if="selected === 'Другое'" class="mt-2">
              <textarea
                v-model="extra"
                rows="3"
                placeholder="Опишите причину..."
                class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-red-500/50 transition-colors"
              />
            </div>

            <button
              @click="submit"
              :disabled="!selected || isSending"
              class="w-full mt-2 py-2.5 bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-colors"
            >
              {{ isSending ? 'Отправка...' : 'Отправить жалобу' }}
            </button>
          </div>

          <div v-else class="text-center py-6">
            <div class="w-12 h-12 bg-green-500/15 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-3">
              <BIcon name="Check" class="w-6 h-6 text-green-400" />
            </div>
            <h4 class="text-white font-bold mb-1">Жалоба отправлена</h4>
            <p class="text-white/45 text-sm">Мы рассмотрим её в ближайшее время</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BIcon from './BIcon.vue'
import api from '@/api'

const props = defineProps<{
  modelValue: boolean
  postId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const reasons = [
  'Спам',
  'Оскорбительный контент',
  'Насилие или жестокость',
  'Ненависть или дискриминация',
  'Дезинформация',
  'Нарушение авторских прав',
  'Незаконный контент',
  'Другое',
]

const selected = ref('')
const extra = ref('')
const sent = ref(false)
const isSending = ref(false)

async function submit() {
  if (!selected.value) return
  isSending.value = true
  try {
    await api.post('/reports', {
      target_type: 'post',
      target_id: props.postId,
      reason: selected.value === 'Другое' ? extra.value || 'Другое' : selected.value,
    }).catch(() => null)
    sent.value = true
    setTimeout(() => {
      emit('update:modelValue', false)
      sent.value = false
      selected.value = ''
    }, 2500)
  } finally {
    isSending.value = false
  }
}
</script>
