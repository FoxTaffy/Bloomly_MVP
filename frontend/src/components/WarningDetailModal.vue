<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, computed, watch } from 'vue'
import api from '../api'
import BIcon from './BIcon.vue'
import { useWarningModalStore } from '../stores/warningModal'
import * as fmt from '@/lib/format'

const store = useWarningModalStore()

const CATEGORY_LABEL: Record<string, string> = {
  spam: 'Спам',
  toxic: 'Токсичность / оскорбления',
  duplicate: 'Дублирующийся контент',
  misinformation: 'Дезинформация',
  fraud: 'Мошенничество',
  suspicious: 'Подозрительная активность',
  manual: 'Нарушение правил сообщества',
  other: 'Нарушение правил сообщества',
}

const meta = computed(() => store.notif?.meta || {})
const categoryLabel = computed(() => CATEGORY_LABEL[meta.value.category] || CATEGORY_LABEL.other)
const showExplainer = ref(false)

const logId = computed(() => meta.value.autoModLogId as string | undefined)
const appealStatus = ref<'none' | 'pending' | 'accepted' | 'rejected'>('none')
const appealTextExisting = ref('')
const appealDraft = ref('')
const isSubmittingAppeal = ref(false)
const isLoadingLog = ref(false)
const appealError = ref('')

watch(() => store.notif, async (n) => {
  appealStatus.value = 'none'
  appealTextExisting.value = ''
  appealDraft.value = ''
  appealError.value = ''
  showExplainer.value = false
  if (!n || !logId.value) return
  isLoadingLog.value = true
  try {
    const res = await api.get(`/automod/warnings/${logId.value}`)
    if (res.data.success) {
      appealStatus.value = res.data.data.log.appeal_status
      appealTextExisting.value = res.data.data.log.appeal_text || ''
    }
  } catch {} finally { isLoadingLog.value = false }
}, { immediate: true })

const submitAppeal = async () => {
  if (!logId.value || !appealDraft.value.trim()) return
  isSubmittingAppeal.value = true
  appealError.value = ''
  try {
    await api.post(`/automod/warnings/${logId.value}/appeal`, { text: appealDraft.value.trim() })
    appealStatus.value = 'pending'
    appealTextExisting.value = appealDraft.value.trim()
  } catch (e) {
    appealError.value = apiErrorMessage(e) ?? 'Не удалось отправить апелляцию'
  } finally { isSubmittingAppeal.value = false }
}

const formatDate = (d?: string) => d ? fmt.formatDate(d, 'longPadded', 'ru-RU') : ''
</script>

<template>
  <Teleport to="body">
    <Transition name="warn-fade" appear>
      <div v-if="store.notif" class="fixed inset-0 z-[700] flex items-end sm:items-center justify-center" @click.self="store.close()">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="store.close()" />

        <div class="relative w-full sm:max-w-sm bg-[#13131f] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden z-10 max-h-[90vh] flex flex-col">
          <div class="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

          <div class="overflow-y-auto flex-1 px-6 py-6">
            <div class="flex flex-col items-center text-center gap-3 mb-5">
              <div class="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                <BIcon name="TriangleAlert" class="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <h2 class="text-lg font-extrabold text-white">Материал удалён</h2>
                <p class="text-xs text-white/40 mt-1">Он нарушает наши Правила сообщества</p>
              </div>
            </div>

            <button @click="showExplainer = !showExplainer"
              class="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-left mb-4 transition-all">
              <span class="text-sm font-bold text-amber-400">⚠️ Предупреждение {{ meta.count ?? '?' }} из {{ meta.limit ?? 5 }}</span>
              <BIcon name="ChevronDown" class="w-4 h-4 text-amber-400 transition-transform" :class="showExplainer ? 'rotate-180' : ''" />
            </button>
            <Transition name="warn-expand">
              <p v-if="showExplainer" class="text-xs text-white/50 leading-relaxed -mt-2 mb-4 px-1">
                За это нарушение вы получили предупреждение. Последующие нарушения приведут к новым предупреждениям — после
                {{ meta.limit ?? 5 }} предупреждений аккаунт будет временно заморожен до проверки модератором.
              </p>
            </Transition>

            <div v-if="meta.targetLabel || meta.targetThumbnail" class="mb-4">
              <p class="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-1.5">Описание материала</p>
              <div class="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
                <img v-if="meta.targetThumbnail" :src="meta.targetThumbnail" class="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-semibold text-white truncate">{{ meta.targetLabel }}</p>
                  <p v-if="meta.targetDate" class="text-[11px] text-white/35">Опубликовано {{ formatDate(meta.targetDate) }}</p>
                </div>
              </div>
            </div>

            <div class="mb-4">
              <p class="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-1.5">Обнаруженные нарушения</p>
              <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p class="text-sm font-bold text-white mb-1">{{ categoryLabel }}</p>
                <p class="text-xs text-white/55 leading-relaxed">{{ meta.reason }}</p>
              </div>
            </div>

            <div v-if="meta.imageUrl" class="mb-5">
              <p class="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-1.5">Доказательство</p>
              <img :src="meta.imageUrl" class="w-full max-h-48 object-cover rounded-2xl border border-white/10" />
            </div>

            <!-- Appeal -->
            <div v-if="logId" class="border-t border-white/10 pt-4">
              <p v-if="appealStatus === 'none'" class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Не согласны с решением?</p>
              <template v-if="appealStatus === 'none'">
                <textarea v-model="appealDraft" rows="2" placeholder="Опишите, почему считаете это решение ошибочным"
                  class="w-full rounded-2xl px-4 py-2.5 text-sm text-white bg-white/[0.05] border border-white/[0.08] outline-none resize-none focus:border-violet-500/40 transition-all placeholder:text-white/25" />
                <p v-if="appealError" class="text-xs text-rose-400 font-semibold mt-1.5">{{ appealError }}</p>
                <button @click="submitAppeal" :disabled="isSubmittingAppeal || !appealDraft.trim()"
                  class="w-full mt-2 py-2.5 rounded-2xl text-sm font-bold bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white transition-all">
                  {{ isSubmittingAppeal ? 'Отправка…' : 'Подать апелляцию' }}
                </button>
              </template>
              <div v-else-if="appealStatus === 'pending'" class="flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
                <BIcon name="Clock" class="w-4 h-4 flex-shrink-0" /> Апелляция на рассмотрении
              </div>
              <div v-else-if="appealStatus === 'accepted'" class="flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3">
                <BIcon name="CheckCircle2" class="w-4 h-4 flex-shrink-0" /> Апелляция принята, предупреждение снято
              </div>
              <div v-else-if="appealStatus === 'rejected'" class="flex items-center gap-2 text-xs font-semibold text-white/40 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                <BIcon name="XCircle" class="w-4 h-4 flex-shrink-0" /> Апелляция отклонена
              </div>
            </div>
          </div>

          <div class="px-6 py-4 border-t border-white/10 flex-shrink-0">
            <button @click="store.close()"
              class="w-full py-2.5 rounded-2xl text-sm font-bold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all">
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.warn-fade-enter-active, .warn-fade-leave-active { transition: opacity 0.2s ease; }
.warn-fade-enter-from, .warn-fade-leave-to { opacity: 0; }
.warn-expand-enter-active, .warn-expand-leave-active { transition: all 0.2s ease; overflow: hidden; }
.warn-expand-enter-from, .warn-expand-leave-to { opacity: 0; max-height: 0; }
.warn-expand-enter-to, .warn-expand-leave-from { max-height: 200px; }
</style>
