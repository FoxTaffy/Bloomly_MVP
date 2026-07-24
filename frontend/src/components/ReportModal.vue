<template>
  <Teleport to="body">
    <Transition name="report-backdrop">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[300] flex items-end sm:items-center justify-center sm:p-4"
        @click.self="close"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="close" />

        <Transition name="report-panel">
          <div
            v-if="modelValue"
            class="relative w-full sm:max-w-sm bg-[#13131f] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          >
            <!-- drag handle (mobile) -->
            <div class="sm:hidden flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 rounded-full bg-white/15" />
            </div>

            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                  <BIcon name="Flag" class="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <h3 class="text-sm font-extrabold text-white leading-none">Пожаловаться</h3>
                  <p class="text-[11px] text-white/35 mt-0.5">
                    {{ targetType === 'group' ? 'на сообщество' : targetType === 'message' ? 'на сообщение' : targetType === 'user' ? 'на пользователя' : 'на публикацию' }}
                  </p>
                </div>
              </div>
              <button
                @click="close"
                class="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
              >
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <!-- Success state -->
            <Transition name="fade" mode="out-in">
              <div v-if="sent" key="success" class="p-8 text-center">
                <div class="relative w-16 h-16 mx-auto mb-4">
                  <div class="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style="animation-duration:1.5s" />
                  <div class="relative w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <BIcon name="CheckCircle2" class="w-8 h-8 text-emerald-400" />
                  </div>
                </div>
                <h4 class="text-white font-extrabold text-base mb-1">Жалоба отправлена</h4>
                <p class="text-white/40 text-sm">Модераторы рассмотрят её в ближайшее время</p>
              </div>

              <!-- Form -->
              <div v-else key="form" class="p-4 space-y-2 max-h-[70vh] overflow-y-auto overscroll-contain">
                <div v-if="evidence" class="flex items-start gap-2 px-3.5 py-2.5 mb-3 rounded-2xl bg-white/[0.03] border border-white/8">
                  <BIcon name="Quote" class="w-3.5 h-3.5 text-white/25 flex-shrink-0 mt-0.5" />
                  <div class="min-w-0">
                    <p class="text-[10px] text-white/30 mb-0.5">Приложено к жалобе как доказательство</p>
                    <p class="text-xs text-white/60 line-clamp-3">{{ evidence }}</p>
                  </div>
                </div>
                <p class="text-[11px] font-bold text-white/35 uppercase tracking-wider px-1 mb-3">Выберите причину</p>

                <button
                  v-for="item in REASONS"
                  :key="item.value"
                  type="button"
                  @click="selected = item.value"
                  class="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left transition-all duration-150 group"
                  :class="selected === item.value
                    ? 'bg-red-500/10 ring-1 ring-red-500/30'
                    : 'bg-white/[0.03] hover:bg-white/[0.06]'"
                >
                  <div
                    class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all"
                    :class="selected === item.value ? item.activeBg : 'bg-white/5'"
                  >
                    <BIcon :name="item.icon" class="w-4 h-4 transition-colors" :class="selected === item.value ? item.activeColor : 'text-white/40'" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold leading-none transition-colors" :class="selected === item.value ? 'text-white' : 'text-white/60 group-hover:text-white/80'">
                      {{ item.label }}
                    </p>
                    <p class="text-[11px] text-white/30 mt-0.5 leading-tight">{{ item.desc }}</p>
                  </div>
                  <div
                    class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
                    :class="selected === item.value ? 'border-red-400 bg-red-400' : 'border-white/20'"
                  >
                    <div v-if="selected === item.value" class="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                </button>

                <!-- Custom reason textarea -->
                <Transition name="expand">
                  <div v-if="selected === 'other'" class="pt-1">
                    <textarea
                      v-model="extra"
                      rows="3"
                      placeholder="Подробно опишите нарушение…"
                      class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder-white/20 resize-none outline-none focus:border-red-500/30 focus:bg-white/6 transition-all"
                    />
                  </div>
                </Transition>

                <div class="pt-2">
                  <p class="text-[11px] font-bold text-white/35 uppercase tracking-wider px-1 mb-2">Доказательства (необязательно)</p>
                  <MediaUpload
                    ref="evidenceUploadRef"
                    folder="reports"
                    accept="image/*"
                    :multiple="true"
                    :max-files="MAX_EVIDENCE_FILES"
                    :max-size-mb="10"
                    @uploaded="onEvidenceUploaded"
                  />
                </div>

                <p v-if="sendError" class="text-[12px] text-red-400 px-1 pt-1">{{ sendError }}</p>

                <!-- Actions -->
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
                    :disabled="!selected || isSending"
                    class="flex-[2] flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-extrabold disabled:opacity-30 transition-all hover:opacity-90 active:scale-[0.98]"
                    style="background: linear-gradient(135deg, #dc2626, #991b1b)"
                  >
                    <span v-if="isSending" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <BIcon v-else name="Flag" class="w-4 h-4" />
                    {{ isSending ? 'Отправка…' : 'Отправить жалобу' }}
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
import BIcon from './BIcon.vue'
import MediaUpload from './MediaUpload.vue'
import api from '@/api'

const MAX_EVIDENCE_FILES = 5

const props = defineProps<{
  modelValue: boolean
  targetId: string
  targetType?: 'post' | 'group' | 'listing' | 'message' | 'user'
  postId?: string
  /** Extra context (e.g. quoted message text + sender) sent as evidence for moderators. */
  evidence?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

interface Reason {
  value: string
  label: string
  desc: string
  icon: string
  activeBg: string
  activeColor: string
}

const REASONS: Reason[] = [
  {
    value: 'spam',
    label: 'Спам или реклама',
    desc: 'Нежелательные сообщения, массовые рассылки',
    icon: 'AlertOctagon',
    activeBg: 'bg-orange-500/15',
    activeColor: 'text-orange-400',
  },
  {
    value: 'fraud',
    label: 'Мошенничество / обман',
    desc: 'Ложная информация с целью наживы',
    icon: 'ShieldAlert',
    activeBg: 'bg-yellow-500/15',
    activeColor: 'text-yellow-400',
  },
  {
    value: 'adult',
    label: 'Нежелательный контент',
    desc: 'Оскорбительный, шокирующий или 18+ контент',
    icon: 'EyeOff',
    activeBg: 'bg-pink-500/15',
    activeColor: 'text-pink-400',
  },
  {
    value: 'violence',
    label: 'Насилие или угрозы',
    desc: 'Жестокость, агрессия, призывы к насилию',
    icon: 'Swords',
    activeBg: 'bg-red-500/15',
    activeColor: 'text-red-400',
  },
  {
    value: 'copyright',
    label: 'Нарушение авторских прав',
    desc: 'Контент без разрешения правообладателя',
    icon: 'Copyright',
    activeBg: 'bg-blue-500/15',
    activeColor: 'text-blue-400',
  },
  {
    value: 'misinformation',
    label: 'Дезинформация',
    desc: 'Намеренно ложные или вводящие в заблуждение факты',
    icon: 'MessageSquareWarning',
    activeBg: 'bg-amber-500/15',
    activeColor: 'text-amber-400',
  },
  {
    value: 'other',
    label: 'Другое',
    desc: 'Иная причина, не указанная выше',
    icon: 'MoreHorizontal',
    activeBg: 'bg-white/10',
    activeColor: 'text-white/70',
  },
]

const selected = ref('')
const extra = ref('')
const sent = ref(false)
const isSending = ref(false)
const sendError = ref('')
const evidenceUrls = ref<string[]>([])
const evidenceUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

function onEvidenceUploaded(urls: string[]) {
  evidenceUrls.value = urls
}

watch(() => props.modelValue, (v) => {
  if (!v) {
    setTimeout(() => {
      selected.value = ''
      extra.value = ''
      sent.value = false
      sendError.value = ''
      evidenceUrls.value = []
      evidenceUploadRef.value?.clearAll()
    }, 300)
  }
})

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  if (!selected.value || isSending.value) return
  isSending.value = true
  const reason = selected.value === 'other'
    ? (extra.value.trim() || 'Другое')
    : REASONS.find(r => r.value === selected.value)?.label ?? selected.value

  sendError.value = ''
  try {
    const effectiveId = props.targetId || props.postId || ''
    const effectiveType = props.targetType ?? 'post'
    const fullReason = props.evidence ? `${reason}\n\n— Сообщение —\n${props.evidence}` : reason
    await api.post('/admin/reports', {
      targetType: effectiveType,
      targetId: effectiveId,
      reason: fullReason,
      evidenceUrls: evidenceUrls.value,
    })
    sent.value = true
    setTimeout(() => close(), 2800)
  } catch (e) {
    sendError.value = 'Не удалось отправить жалобу. Попробуйте ещё раз.'
  } finally {
    isSending.value = false
  }
}
</script>

<style scoped>
.report-backdrop-enter-active,
.report-backdrop-leave-active { transition: opacity 0.25s ease; }
.report-backdrop-enter-from,
.report-backdrop-leave-to { opacity: 0; }

.report-panel-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.report-panel-leave-active { transition: all 0.2s ease; }
.report-panel-enter-from { opacity: 0; transform: translateY(24px) scale(0.96); }
.report-panel-leave-to { opacity: 0; transform: translateY(12px) scale(0.98); }

@media (max-width: 639px) {
  .report-panel-enter-from { transform: translateY(100%); }
  .report-panel-leave-to { transform: translateY(100%); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.expand-enter-active { transition: all 0.2s ease; }
.expand-leave-active { transition: all 0.15s ease; }
.expand-enter-from, .expand-leave-to { opacity: 0; transform: translateY(-6px); max-height: 0; }
.expand-enter-to, .expand-leave-from { max-height: 200px; }
</style>
