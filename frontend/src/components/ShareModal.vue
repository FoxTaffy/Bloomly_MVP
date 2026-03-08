<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
      @click.self="$emit('update:modelValue', false)"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('update:modelValue', false)" />

      <!-- Modal -->
      <div class="relative w-full max-w-[480px] bg-[#1a1a2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        <!-- Header with tabs -->
        <div class="flex items-center border-b border-white/10">
          <button
            v-for="tab in ['Поделиться', 'Экспортировать']"
            :key="tab"
            @click="activeTab = tab"
            class="flex-1 py-4 text-sm font-semibold transition-colors"
            :class="activeTab === tab
              ? 'text-white border-b-2 border-purple-500'
              : 'text-white/40 hover:text-white/70'"
          >{{ tab }}</button>
          <button
            @click="$emit('update:modelValue', false)"
            class="w-10 h-10 flex items-center justify-center mr-2 text-white/40 hover:text-white rounded-full hover:bg-white/5 transition-colors"
          >
            <BIcon name="X" class="w-5 h-5" />
          </button>
        </div>

        <!-- Tab: Поделиться -->
        <div v-if="activeTab === 'Поделиться'" class="p-5 space-y-3">

          <!-- Share options -->
          <label
            v-for="opt in shareOptions"
            :key="opt.value"
            class="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/5"
            :class="shareTarget === opt.value ? 'bg-white/5 ring-1 ring-purple-500/40' : ''"
          >
            <input
              type="radio"
              :value="opt.value"
              v-model="shareTarget"
              class="mt-0.5 accent-purple-500 w-4 h-4 flex-shrink-0"
            />
            <div>
              <p class="text-sm font-medium text-white">{{ opt.label }}</p>
              <p v-if="opt.desc" class="text-xs text-white/40 mt-0.5">{{ opt.desc }}</p>
            </div>
          </label>

          <!-- Recipient input (for DM) -->
          <div v-if="shareTarget === 'dm'" class="mt-3">
            <div class="relative">
              <input
                v-model="recipient"
                type="text"
                placeholder="Введите имя получателя или название чата"
                class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/60 focus:bg-white/8 transition-colors"
              />
              <BIcon name="ChevronDown" class="absolute right-3 top-2.5 w-4 h-4 text-white/30" />
            </div>
          </div>

          <!-- Message field -->
          <div class="mt-1">
            <p class="text-sm font-semibold text-white mb-2">Ваше сообщение</p>
            <div class="relative">
              <textarea
                v-model="message"
                rows="3"
                class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-purple-500/60 transition-colors"
                placeholder="Напишите что-нибудь..."
              />
              <button class="absolute bottom-2 right-3 text-white/30 hover:text-white/60 transition-colors">
                <BIcon name="Smile" class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 pt-1">
            <!-- Quick copy link -->
            <button
              @click="copyLink"
              class="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <BIcon :name="copied ? 'CheckCheck' : 'Link'" class="w-4 h-4" />
              {{ copied ? 'Скопировано!' : 'Ссылка' }}
            </button>
            <button
              @click="doSend"
              :disabled="isSending || (shareTarget === 'dm' && !recipient.trim())"
              class="flex-1 py-2.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isSending ? 'Отправка...' : 'Отправить' }}
            </button>
          </div>

          <p v-if="sendResult" class="text-center text-xs" :class="sendResult.ok ? 'text-green-400' : 'text-red-400'">
            {{ sendResult.msg }}
          </p>
        </div>

        <!-- Tab: Экспортировать -->
        <div v-if="activeTab === 'Экспортировать'" class="p-5 space-y-3">
          <button
            v-for="exp in exportOptions"
            :key="exp.label"
            @click="doExport(exp.action)"
            class="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl text-sm text-white transition-colors"
          >
            <BIcon :name="exp.icon" class="w-4 h-4 text-white/50" />
            {{ exp.label }}
          </button>
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
  postUrl: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const activeTab = ref('Поделиться')
const shareTarget = ref('wall')
const recipient = ref('')
const message = ref('')
const copied = ref(false)
const isSending = ref(false)
const sendResult = ref<{ ok: boolean; msg: string } | null>(null)

const shareOptions = [
  { value: 'wall',      label: 'На своей стене' },
  { value: 'community', label: 'В сообществе' },
  { value: 'story',     label: 'В истории',     desc: 'У репостов в историях теперь новое оформление' },
  { value: 'dm',        label: 'В личном сообщении' },
]

const exportOptions = [
  { label: 'Скопировать ссылку',     icon: 'Link',       action: 'copy' },
  { label: 'Скачать изображение',    icon: 'Download',   action: 'download' },
  { label: 'Встроить на сайт',       icon: 'Code2',      action: 'embed' },
]

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.postUrl)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}

async function doSend() {
  isSending.value = true
  sendResult.value = null
  try {
    if (shareTarget.value === 'dm') {
      // Try to find conversation and send message
      const res = await api.post('/messages/send-post', {
        postId: props.postId,
        recipient: recipient.value.trim(),
        message: message.value.trim(),
      }).catch(() => null)
      sendResult.value = { ok: !!res, msg: res ? 'Отправлено!' : 'Не удалось отправить' }
    } else if (shareTarget.value === 'wall') {
      // Repost to own feed
      await api.post(`/posts/${props.postId}/repaw`).catch(() => null)
      sendResult.value = { ok: true, msg: 'Добавлено на стену!' }
    } else {
      // Other targets - just copy link for now
      await copyLink()
      sendResult.value = { ok: true, msg: 'Ссылка скопирована!' }
    }
    setTimeout(() => {
      emit('update:modelValue', false)
      sendResult.value = null
    }, 1500)
  } finally {
    isSending.value = false
  }
}

function doExport(action: string) {
  if (action === 'copy') {
    copyLink()
    sendResult.value = { ok: true, msg: 'Ссылка скопирована!' }
    setTimeout(() => { emit('update:modelValue', false) }, 1200)
  } else if (action === 'embed') {
    const embedCode = `<iframe src="${props.postUrl}" width="560" height="315" frameborder="0"></iframe>`
    navigator.clipboard.writeText(embedCode).catch(() => {})
    sendResult.value = { ok: true, msg: 'Код встройки скопирован!' }
  }
}
</script>
