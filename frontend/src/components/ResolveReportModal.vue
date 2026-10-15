<script setup lang="ts">
import { ref, computed } from 'vue'
import api from '../api'
import BIcon from './BIcon.vue'
import MediaUpload from './MediaUpload.vue'
import SafeMedia from './SafeMedia.vue'

const props = defineProps<{ folder: any }>()
const emit = defineEmits<{ close: []; resolved: [] }>()

const REPORT_TARGET_LABEL: Record<string, string> = { post: 'Пост', group: 'Группа', listing: 'Лот', message: 'Сообщение', user: 'Профиль' }

const CATEGORIES = [
  { value: 'spam', label: 'Спам' },
  { value: 'toxic', label: 'Токсичность / оскорбления' },
  { value: 'duplicate', label: 'Дублирующийся контент' },
  { value: 'misinformation', label: 'Дезинформация' },
  { value: 'fraud', label: 'Мошенничество' },
  { value: 'other', label: 'Другое' },
]

const deletable = computed(() =>
  (props.folder.target_type === 'post' && props.folder.post) ||
  (props.folder.target_type === 'user' && props.folder.reportedUser) ||
  (props.folder.target_type === 'group' && props.folder.reportedGroup))

const DELETE_LABEL: Record<string, string> = { post: 'пост', user: 'профиль', group: 'группу' }

const deleteContent = ref(deletable.value)
const category = ref('other')
const reason = ref(props.folder.reports?.[0]?.reason || '')
const imageUrl = ref('')
const isSubmitting = ref(false)
const error = ref('')

const submit = async () => {
  if (!reason.value.trim()) { error.value = 'Укажите сообщение для пользователя'; return }
  isSubmitting.value = true
  error.value = ''
  try {
    const ids = props.folder.reports.filter((r: any) => r.status === 'pending').map((r: any) => r.id)
    await api.patch('/admin/reports/resolve-issue', {
      ids,
      targetType: props.folder.target_type,
      targetId: props.folder.target_id,
      deleteContent: deleteContent.value,
      reason: reason.value.trim(),
      category: category.value,
      imageUrl: imageUrl.value || undefined,
    })
    emit('resolved')
    emit('close')
  } catch (e: any) {
    error.value = e?.response?.data?.error?.message ?? 'Не удалось решить жалобу'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="resolve-fade" appear>
      <div class="fixed inset-0 z-[700] flex items-end sm:items-center justify-center" @click.self="emit('close')">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

        <div class="relative w-full sm:max-w-md bg-[#13131f] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden z-10 max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10 flex-shrink-0">
            <h2 class="text-lg font-extrabold text-white">Решить проблему</h2>
            <button @click="emit('close')"
              class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.05] hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-90 flex-shrink-0">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>

          <div class="px-6 py-5 space-y-4 overflow-y-auto">
            <p class="text-xs text-white/40 leading-snug">
              Жалоба на {{ (REPORT_TARGET_LABEL[folder.target_type] ?? folder.target_type).toLowerCase() }}: «{{ folder.reports[0].reason }}»
            </p>
            <p v-if="folder.target_type === 'group'" class="text-xs text-white/30 leading-snug -mt-2">
              Предупреждение будет отправлено владельцу группы.
            </p>

            <label v-if="deletable" class="flex items-center gap-2.5 p-3 rounded-2xl border border-white/10 bg-white/[0.03] cursor-pointer">
              <input type="checkbox" v-model="deleteContent" class="w-4 h-4 accent-rose-500" />
              <span class="text-sm text-white font-semibold">Удалить {{ DELETE_LABEL[folder.target_type] ?? 'объект' }}</span>
            </label>

            <div>
              <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5">Категория нарушения</p>
              <select v-model="category"
                class="w-full rounded-2xl px-4 py-2.5 text-sm text-white bg-white/[0.05] border border-white/[0.08] outline-none focus:border-[#4C67CF]/45 focus:bg-white/[0.08] transition-all">
                <option v-for="c in CATEGORIES" :key="c.value" :value="c.value" class="bg-[#13131f]">{{ c.label }}</option>
              </select>
            </div>

            <div>
              <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5">Сообщение пользователю *</p>
              <textarea v-model="reason" rows="3" placeholder="Объясните, что нарушено и почему принято это решение"
                class="w-full rounded-2xl px-4 py-2.5 text-sm text-white bg-white/[0.05] border border-white/[0.08] outline-none resize-none focus:border-[#4C67CF]/45 focus:bg-white/[0.08] transition-all placeholder:text-white/25" />
            </div>

            <div>
              <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Фото-доказательство (опционально)</p>
              <div v-if="imageUrl" class="flex items-center gap-3 p-3 bg-white/[0.05] border border-white/[0.08] rounded-2xl">
                <SafeMedia :src="imageUrl" class="w-16 h-12 object-cover rounded-xl flex-shrink-0" />
                <span class="flex-1 text-xs text-white/45 truncate">Загружено</span>
                <button @click="imageUrl = ''" class="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-rose-500/20 flex items-center justify-center transition-all">
                  <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
                </button>
              </div>
              <MediaUpload v-else type="banners" @uploaded="(urls: string[]) => imageUrl = urls[0] ?? ''" />
            </div>

            <p v-if="error" class="text-xs text-rose-400 font-semibold">{{ error }}</p>
          </div>

          <div class="flex gap-2 justify-end px-6 py-4 border-t border-white/10 flex-shrink-0">
            <button @click="emit('close')"
              class="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white hover:bg-white/[0.05] border border-white/[0.08] transition-all">Отмена</button>
            <button @click="submit" :disabled="isSubmitting || !reason.trim()"
              class="px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black transition-all">
              {{ isSubmitting ? 'Отправка…' : 'Выдать предупреждение' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.resolve-fade-enter-active, .resolve-fade-leave-active { transition: opacity 0.2s ease; }
.resolve-fade-enter-from, .resolve-fade-leave-to { opacity: 0; }
</style>
